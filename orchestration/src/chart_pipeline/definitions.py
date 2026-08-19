import hashlib
import json
import os
import shutil
import threading
from calendar import monthrange
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import dagster as dg
from era5_heat import compute_heat_series, fixture_demo
from era5_heat.io import output_paths, write_json, write_table
from geoalchemy2.shape import to_shape
from isimip_projection import (
    APPROVED_SCENARIOS,
    ProjectionRequest,
    prepare_projection_records,
)
from seasonal_c3s import (
    SeasonalRequest,
    prepare_seasonal_records,
)
from shapely.geometry import mapping

from chart.climate.data_contract import MonthlyClimateRecord
from chart.climate.input_windows import select_input_months, target_months
from chart.climate.ingestion_leases import run_single_flight_ingestion
from chart.climate.projection_adapter import (
    ProjectionManifest,
    ProjectionMonthValue,
    adapt_projection_months,
)
from chart.climate.source_policy import (
    latest_seasonal_issue_month,
    resolve_month_source,
)
from chart.climate.requests import (
    activate_waiting_prediction_requests,
    claim_prediction_request,
    complete_prediction_request,
    fail_prediction_request,
    heartbeat_prediction_request,
    prepare_prediction_input,
    reserve_queued_prediction_requests,
    set_prediction_request_stage,
)
from chart.climate.service import ClimateServiceError
from chart.shared.db.climate_load import (
    load_era5_monthly_frame,
    load_monthly_climate_records,
)
from chart.shared.db.models import AdminUnit
from chart.shared.db.session import get_session_factory

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_OUTDIR = REPO_ROOT / "data" / "climate"


class PredictionRequestConfig(dg.Config):
    request_id: int
    geography_id: str
    admin_unit_id: int
    planning_date: str
    source_as_of: str
    lease_token: str
    use_fixture: bool = False
    planning_target: str = "month"
    projection_scenario: str | None = None
    projection_period: str | None = None


@dg.op
def process_prediction_request(
    context: dg.OpExecutionContext,
    config: PredictionRequestConfig,
) -> None:
    source_as_of = datetime.fromisoformat(config.source_as_of)
    if source_as_of.tzinfo is None:
        source_as_of = source_as_of.replace(tzinfo=timezone.utc)
    if not claim_prediction_request(
        config.request_id,
        dagster_run_id=context.run_id,
        lease_token=config.lease_token,
    ):
        context.log.info(
            "Request %s is already claimed or completed", config.request_id
        )
        return

    try:
        with _prediction_lease_heartbeat(
            context, config.request_id, config.lease_token
        ):
            refresh_attempts = 0
            while True:
                try:
                    prepare_prediction_input(
                        config.request_id,
                        live=not config.use_fixture,
                        now=source_as_of,
                        lease_token=config.lease_token,
                    )
                    break
                except ClimateServiceError as error:
                    refreshable_errors = {
                        "CLIMATE_DATA_NOT_READY",
                        "CLIMATE_WINDOW_GRAIN_MISMATCH",
                        "CLIMATE_SAMPLE_NOT_LIVE",
                        "CLIMATE_DATA_STALE",
                    }
                    if error.code not in refreshable_errors or refresh_attempts >= 2:
                        raise
                    refresh_attempts += 1
                    metadata = _prepare_required_climate(
                        context,
                        admin_unit_id=config.admin_unit_id,
                        planning_date=date.fromisoformat(config.planning_date),
                        source_as_of=source_as_of,
                        use_fixture=config.use_fixture,
                        force_full_window=(
                            error.code == "CLIMATE_WINDOW_GRAIN_MISMATCH"
                        ),
                        projection_scenario=config.projection_scenario,
                        projection_period=config.projection_period,
                    )
                    context.log_event(
                        dg.AssetMaterialization(
                            asset_key=["climate", "model_input"],
                            metadata=metadata,
                        )
                    )
                    if not heartbeat_prediction_request(
                        config.request_id, lease_token=config.lease_token
                    ):
                        raise ClimateServiceError("PREDICTION_LEASE_LOST", 409)

            set_prediction_request_stage(
                config.request_id,
                "predicting",
                lease_token=config.lease_token,
            )
            prediction = complete_prediction_request(
                config.request_id,
                lease_token=config.lease_token,
            )
            context.log.info(
                "Completed request %s with odds ratio %s",
                config.request_id,
                prediction.prediction.odds_ratio,
            )
    except Exception as error:
        fail_prediction_request(
            config.request_id,
            error_code=getattr(error, "code", type(error).__name__),
            lease_token=config.lease_token,
        )
        raise


@dg.job(description="Prepare three traceable climate months, then run one prediction.")
def prediction_request_job():
    process_prediction_request()


@dg.sensor(
    job=prediction_request_job,
    minimum_interval_seconds=5,
    default_status=dg.DefaultSensorStatus.RUNNING,
)
def pending_prediction_requests_sensor(_context: dg.SensorEvaluationContext):
    activate_waiting_prediction_requests()
    queued_requests = reserve_queued_prediction_requests(
        limit=max(1, int(os.getenv("PREDICTION_DISPATCH_LIMIT", "4")))
    )
    if not queued_requests:
        yield dg.SkipReason("No queued prediction requests.")
        return

    use_fixture = (
        os.getenv("CLIMATE_USE_FIXTURE", os.getenv("ERA5_USE_FIXTURE", "0")) == "1"
    )
    for request in queued_requests:
        yield dg.RunRequest(
            run_key=f"prediction-request:{request.id}:attempt:{request.attempt_count}",
            run_config={
                "ops": {
                    "process_prediction_request": {
                        "config": {
                            "request_id": request.id,
                            "geography_id": request.geography_id,
                            "admin_unit_id": request.admin_unit_id,
                            "planning_date": request.planning_date.isoformat(),
                            "source_as_of": request.source_as_of.isoformat(),
                            "lease_token": request.lease_token,
                            "use_fixture": use_fixture,
                            "planning_target": request.planning_target,
                            "projection_scenario": request.projection_scenario,
                            "projection_period": request.projection_period,
                        }
                    }
                }
            },
            tags={
                "trigger": "prediction-request",
                "prediction_request_id": str(request.id),
                "geography_id": request.geography_id,
                "data_before_model": "true",
            },
        )


def _prepare_required_climate(
    context: dg.OpExecutionContext,
    *,
    admin_unit_id: int,
    planning_date: date,
    source_as_of: datetime,
    use_fixture: bool,
    force_full_window: bool = False,
    projection_scenario: str | None = None,
    projection_period: str | None = None,
) -> dict:
    _ensure_climate_storage_capacity()
    session_factory = get_session_factory()
    with session_factory() as session:
        admin_unit = session.get(AdminUnit, admin_unit_id)
        if admin_unit is None:
            raise ClimateServiceError("CLIMATE_PLACE_NOT_FOUND", 404)
        selected = select_input_months(
            session,
            admin_unit_id=admin_unit_id,
            target_end_month=planning_date,
            now=source_as_of,
            projection_scenario=projection_scenario,
            projection_period=projection_period,
        )
        months_to_load = (
            list(target_months(planning_date))
            if force_full_window
            else [
                month
                for month, row in selected
                if row is None
                or (
                    not use_fixture
                    and _selected_row_needs_live_refresh(row, source_as_of)
                )
            ]
        )
        place = _place_snapshot(admin_unit)

    if not months_to_load:
        return {"admin_unit_id": admin_unit_id, "new_runs": 0}
    if use_fixture:
        fixture_run_ids = [
            run_single_flight_ingestion(
                _acquisition_identity(
                    place,
                    source_class="fixture",
                    months=months_to_load,
                    source_as_of=source_as_of.isoformat(),
                    scenario=projection_scenario,
                    period=projection_period,
                ),
                lambda: _load_fixture(
                    context,
                    place,
                    planning_date,
                    months_to_load,
                    source_as_of,
                    session_factory,
                    projection_scenario=projection_scenario,
                    projection_period=projection_period,
                )[0],
                session_factory=session_factory,
            )
        ]
        # Fixture loading may create one run per source class. Read their IDs
        # from the selected months rather than rerunning the acquisition.
        with session_factory() as session:
            fixture_run_ids = sorted(
                {
                    row[1].id
                    for _, row in select_input_months(
                        session,
                        admin_unit_id=admin_unit_id,
                        target_end_month=planning_date,
                        now=source_as_of,
                        projection_scenario=projection_scenario,
                        projection_period=projection_period,
                    )
                    if row is not None
                }
            )
        return {
            "admin_unit_id": admin_unit_id,
            "source": "offline_fixture",
            "new_runs": len(fixture_run_ids),
            "climate_run_ids": fixture_run_ids,
        }

    decisions = {
        month: resolve_month_source(
            month,
            now=source_as_of,
            projection_scenario=projection_scenario,
            projection_period=projection_period,
        )
        for month in months_to_load
    }
    unavailable = [
        month for month, decision in decisions.items() if decision.source_class is None
    ]
    if unavailable:
        raise ClimateServiceError(
            "CLIMATE_HORIZON_NOT_AVAILABLE",
            409,
            ", ".join(month.strftime("%Y-%m") for month in unavailable),
        )
    observed = [
        month
        for month, decision in decisions.items()
        if decision.source_class == "observed"
    ]
    forecast = [
        month
        for month, decision in decisions.items()
        if decision.source_class == "seasonal"
    ]
    projection = [
        month
        for month, decision in decisions.items()
        if decision.source_class == "projection"
    ]
    run_ids: list[int] = []
    if observed:
        run_ids.append(
            run_single_flight_ingestion(
                _acquisition_identity(
                    place,
                    source_class="observed",
                    months=observed,
                ),
                lambda: _load_observed(context, place, observed, session_factory),
                session_factory=session_factory,
            )
        )
    if forecast:
        run_ids.append(
            run_single_flight_ingestion(
                _acquisition_identity(
                    place,
                    source_class="seasonal",
                    months=forecast,
                    issue=latest_seasonal_issue_month(source_as_of).isoformat(),
                ),
                lambda: _load_seasonal(
                    context,
                    place,
                    forecast,
                    source_as_of,
                    session_factory,
                ),
                session_factory=session_factory,
            )
        )
    if projection:
        if projection_scenario is None or projection_period is None:
            raise ClimateServiceError("CLIMATE_PROJECTION_CHOICE_REQUIRED", 409)
        run_ids.append(
            run_single_flight_ingestion(
                _acquisition_identity(
                    place,
                    source_class="projection",
                    months=projection,
                    scenario=projection_scenario,
                    period=projection_period,
                ),
                lambda: _load_projection(
                    context,
                    place,
                    projection,
                    projection_scenario,
                    projection_period,
                    session_factory,
                ),
                session_factory=session_factory,
            )
        )
    return {
        "admin_unit_id": admin_unit_id,
        "new_runs": len(run_ids),
        "climate_run_ids": run_ids,
        "observed_months": [month.strftime("%Y-%m") for month in observed],
        "seasonal_months": [month.strftime("%Y-%m") for month in forecast],
        "projection_months": [month.strftime("%Y-%m") for month in projection],
    }


def _load_fixture(
    context,
    place: dict,
    planning_date: date,
    months: list[date],
    source_as_of: datetime,
    session_factory,
    projection_scenario: str | None = None,
    projection_period: str | None = None,
) -> list[int]:
    years = 2
    df, meta = fixture_demo(
        place["code"],
        years=years,
        end_year=planning_date.year,
        seed=place["id"],
    )
    meta["aggregation_method"] = "polygon_cell_center_coslat_v1"
    meta["downscaling_method"] = "none"
    csv_path, _ = _write_provider_output(
        place["code"], df, meta, planning_date.year - years + 1, planning_date.year
    )
    generated_at = datetime.now(timezone.utc)
    issue_month = latest_seasonal_issue_month(source_as_of)
    rows_by_month = {
        value.replace(day=1): row
        for _, row in df.iterrows()
        for value in [row["month"]]
    }
    records_by_class: dict[str, list[MonthlyClimateRecord]] = {}
    for month in months:
        decision = resolve_month_source(
            month,
            now=source_as_of,
            projection_scenario=projection_scenario,
            projection_period=projection_period,
        )
        if decision.source_class not in {"observed", "seasonal", "projection"}:
            raise ClimateServiceError("CLIMATE_HORIZON_NOT_AVAILABLE", 409)
        row = rows_by_month.get(month)
        if row is None:
            raise ClimateServiceError("CLIMATE_FIXTURE_MONTH_MISSING", 500)
        source_class = decision.source_class
        records_by_class.setdefault(source_class, []).append(
            MonthlyClimateRecord(
                period_month=month,
                value=float(row["tmax_monthly_mean_c"]),
                admin_unit_code=place["code"],
                admin_unit_level=place["level"],
                boundary_version=place["boundary_version"],
                aggregation_method="polygon_cell_center_coslat_v1",
                source_class=source_class,
                source_name=(
                    "Offline ERA5 historical sample"
                    if source_class == "observed"
                    else (
                        "Offline ISIMIP3b projection sample"
                        if source_class == "projection"
                        else "Offline C3S seasonal sample"
                    )
                ),
                source_version="fixture-demo-v1",
                source_uri=f"offline://climate/{source_class}",
                source_license="CHART test fixture; not for live use",
                source_calendar="gregorian",
                data_label="sample",
                quality_status="sample",
                generated_at=generated_at,
                valid_from=(
                    date(int(projection_period[:4]), 1, 1)
                    if source_class == "projection" and projection_period
                    else month
                ),
                valid_to=(
                    date(int(projection_period[-4:]), 12, 31)
                    if source_class == "projection" and projection_period
                    else date(
                        month.year,
                        month.month,
                        monthrange(month.year, month.month)[1],
                    )
                ),
                issue_time=(
                    datetime(
                        issue_month.year,
                        issue_month.month,
                        1,
                        tzinfo=timezone.utc,
                    )
                    if source_class == "seasonal"
                    else None
                ),
                ensemble_member=(
                    "offline sample ensemble mean"
                    if source_class in {"seasonal", "projection"}
                    else None
                ),
                scenario=(
                    projection_scenario if source_class == "projection" else None
                ),
                bias_adjustment=(
                    "W5E5 v2.0 sample" if source_class == "projection" else None
                ),
                downscaling_method="none",
                freshness_status=(
                    "not_applicable" if source_class == "projection" else "current"
                ),
                fresh_until=(
                    None
                    if source_class == "projection"
                    else generated_at + timedelta(days=45)
                ),
            )
        )

    raw_hash = hashlib.sha256(csv_path.read_bytes()).hexdigest()
    run_ids: list[int] = []
    with session_factory() as session:
        admin_unit = session.get(AdminUnit, place["id"])
        assert admin_unit is not None
        for fixture_source_class, records in records_by_class.items():
            run = load_monthly_climate_records(
                session,
                admin_unit=admin_unit,
                records=records,
                raw_object_uri=str(csv_path),
                raw_object_hash=raw_hash,
                provider="CHART offline demo",
                product=f"{fixture_source_class}-fixture",
                access_method="fixture",
            )
            run_ids.append(run.id)
        session.commit()
        context.log.info("Loaded sample climate runs %s", run_ids)
    return run_ids


def _load_observed(context, place: dict, months: list[date], session_factory) -> int:
    if not _cds_credentials_available():
        raise ClimateServiceError("CLIMATE_INGEST_NOT_CONFIGURED", 503)
    df, meta = compute_heat_series(
        district=place["name"],
        bbox=place["bbox"],
        geometry=place["geometry"],
        target_months=tuple(months),
    )
    csv_path, _ = _write_observed_output(place["code"], df, meta, months)
    with session_factory() as session:
        run = load_era5_monthly_frame(
            session,
            preset_slug=place["country_preset"],
            admin_unit_id=place["id"],
            df=df,
            meta=meta,
            csv_path=str(csv_path),
        )
        session.commit()
        context.log.info("Loaded observed climate run %s", run.id)
        return run.id


def _load_seasonal(
    context,
    place: dict,
    months: list[date],
    source_as_of: datetime,
    session_factory,
) -> int:
    if not _cds_credentials_available():
        raise ClimateServiceError("CLIMATE_INGEST_NOT_CONFIGURED", 503)
    issue_month = latest_seasonal_issue_month(source_as_of)
    target_path = (
        Path(os.getenv("CLIMATE_OUTPUT_DIR", DEFAULT_OUTDIR))
        / "raw"
        / f"c3s-seasonal-{place['code']}-{issue_month:%Y-%m}.nc"
    )
    request = SeasonalRequest(
        issue_month=issue_month,
        target_months=tuple(months),
        bbox=place["bbox"],
        geometry=place["geometry"],
        admin_unit_code=place["code"],
        admin_unit_level=place["level"],
        boundary_version=place["boundary_version"],
        output_path=target_path,
    )
    download = prepare_seasonal_records(request)
    generated_at = datetime.now(timezone.utc)
    fresh_date = issue_month + timedelta(days=45)
    fresh_until = datetime(
        fresh_date.year,
        fresh_date.month,
        fresh_date.day,
        tzinfo=timezone.utc,
    )
    records = [
        MonthlyClimateRecord(
            period_month=month,
            value=download.values_c[month],
            admin_unit_code=place["code"],
            admin_unit_level=place["level"],
            boundary_version=place["boundary_version"],
            aggregation_method="polygon_cell_center_coslat_v1",
            source_class="seasonal",
            source_name="C3S ECMWF seasonal forecast",
            source_version=download.source_version,
            source_uri=(
                "https://cds.climate.copernicus.eu/datasets/"
                "seasonal-monthly-single-levels"
            ),
            source_license="CC-BY-4.0 and C3S seasonal terms",
            source_calendar="gregorian",
            data_label="forecast",
            quality_status="provisional",
            freshness_status="current",
            generated_at=generated_at,
            valid_from=month,
            valid_to=date(
                month.year, month.month, monthrange(month.year, month.month)[1]
            ),
            issue_time=download.issue_time,
            ensemble_member=download.ensemble_summary,
            downscaling_method="none",
            fresh_until=fresh_until,
        )
        for month in months
    ]
    with session_factory() as session:
        admin_unit = session.get(AdminUnit, place["id"])
        assert admin_unit is not None
        run = load_monthly_climate_records(
            session,
            admin_unit=admin_unit,
            records=records,
            raw_object_uri=download.raw_object_uri,
            raw_object_hash=download.raw_object_hash,
            provider="Copernicus Climate Change Service / ECMWF",
            product="seasonal-monthly-single-levels",
            access_method="cds_api",
        )
        session.commit()
        context.log.info("Loaded seasonal climate run %s", run.id)
        return run.id


def _load_projection(
    context,
    place: dict,
    months: list[date],
    scenario: str,
    period: str,
    session_factory,
) -> int:
    start_year, end_year = (int(value) for value in period.split("-", 1))
    expected_months = {date(end_year, month, 1) for month in (3, 4, 5)}
    if set(months) != expected_months:
        raise ClimateServiceError("CLIMATE_PROJECTION_MONTHS_INVALID", 409)

    output_dir = (
        Path(os.getenv("CLIMATE_OUTPUT_DIR", DEFAULT_OUTDIR)) / "raw" / "isimip3b"
    )
    try:
        download = prepare_projection_records(
            ProjectionRequest(
                scenario=scenario,
                start_year=start_year,
                end_year=end_year,
                season_months=(3, 4, 5),
                bbox=place["bbox"],
                geometry=place["geometry"],
                admin_unit_code=place["code"],
                admin_unit_level=place["level"],
                boundary_version=place["boundary_version"],
                output_dir=output_dir,
            )
        )
    except Exception as error:
        detail = str(error)
        code = (
            detail.split(":", 1)[0]
            if detail.startswith("ISIMIP_")
            else "CLIMATE_PROJECTION_SOURCE_UNAVAILABLE"
        )
        raise ClimateServiceError(code, 503, detail) from error

    # Expert analytics hook: add reviewed local downscaling here, before saving.
    manifest = ProjectionManifest(
        dataset_family="ISIMIP3b",
        dataset_name="bias-adjusted atmospheric climate input data",
        source_version=download.source_version,
        source_uri="https://doi.org/10.48364/ISIMIP.842396.1",
        source_license="CC0 1.0",
        source_calendar="gregorian",
        source_variable="tasmax",
        source_unit="degC",
        scenario=scenario,
        approved_scenarios=APPROVED_SCENARIOS,
        model_member=download.ensemble_summary,
        bias_adjustment="W5E5 v2.0",
        downscaling_method="native 0.5 degree grid; no local downscaling",
        generated_at=datetime.now(timezone.utc),
        admin_unit_code=place["code"],
        admin_unit_level=place["level"],
        boundary_version=place["boundary_version"],
        projection_period_start=download.valid_from,
        projection_period_end=download.valid_to,
    )
    records = adapt_projection_months(
        manifest,
        [
            ProjectionMonthValue(period_month=month, monthly_mean_daily_tmax=value)
            for month, value in sorted(download.values_c.items())
        ],
    )
    with session_factory() as session:
        admin_unit = session.get(AdminUnit, place["id"])
        assert admin_unit is not None
        run = load_monthly_climate_records(
            session,
            admin_unit=admin_unit,
            records=records,
            raw_object_uri=download.raw_object_uri,
            raw_object_hash=download.raw_object_hash,
            provider="Inter-Sectoral Impact Model Intercomparison Project",
            product="ISIMIP3b InputData bias-adjusted tasmax",
            access_method="isimip_files_api_v2",
        )
        session.commit()
        context.log.info(
            "Loaded ISIMIP3b projection run %s for %s %s", run.id, scenario, period
        )
        return run.id


def _place_snapshot(admin_unit: AdminUnit) -> dict:
    coordinates = (
        admin_unit.bbox_north,
        admin_unit.bbox_west,
        admin_unit.bbox_south,
        admin_unit.bbox_east,
    )
    if any(value is None for value in coordinates):
        raise ClimateServiceError("CLIMATE_PLACE_BBOX_MISSING", 409)
    if admin_unit.boundary is None:
        raise ClimateServiceError("CLIMATE_PLACE_BOUNDARY_MISSING", 409)
    boundary = admin_unit.boundary
    if isinstance(boundary, str):
        geometry = json.loads(boundary)
    else:
        geometry = mapping(to_shape(boundary))
    return {
        "id": admin_unit.id,
        "code": admin_unit.code,
        "name": admin_unit.name,
        "level": admin_unit.level,
        "bbox": coordinates,
        "geometry": geometry,
        "boundary_version": admin_unit.boundary_version or "unknown",
        "country_preset": admin_unit.geography.slug,
    }


def _write_provider_output(slug, df, meta, start_year, end_year):
    outdir = Path(os.getenv("CLIMATE_OUTPUT_DIR", DEFAULT_OUTDIR))
    outdir.mkdir(parents=True, exist_ok=True)
    table_path, meta_path = output_paths(
        outdir,
        district=slug,
        start_year=start_year,
        end_year=end_year,
        table_format="csv",
    )
    write_table(df, table_path, "csv")
    write_json(meta, meta_path)
    return table_path, meta_path


def _write_observed_output(slug, df, meta, months: list[date]):
    outdir = Path(os.getenv("CLIMATE_OUTPUT_DIR", DEFAULT_OUTDIR))
    outdir.mkdir(parents=True, exist_ok=True)
    period_label = "_".join(month.strftime("%Y-%m") for month in sorted(months))
    table_path = outdir / f"{slug}_era5_{period_label}.csv"
    meta_path = outdir / f"{slug}_era5_{period_label}.json"
    write_table(df, table_path, "csv")
    write_json(meta, meta_path)
    return table_path, meta_path


def _selected_row_needs_live_refresh(row, source_as_of: datetime) -> bool:
    _, run, _, _ = row
    if run.data_label.value == "sample" or run.quality_status == "sample":
        return True
    if run.fresh_until is None:
        return True
    fresh_until = run.fresh_until
    if fresh_until.tzinfo is None:
        fresh_until = fresh_until.replace(tzinfo=timezone.utc)
    return fresh_until < source_as_of


def _acquisition_identity(
    place: dict,
    *,
    source_class: str,
    months: list[date],
    **values,
) -> dict[str, object]:
    return {
        "contract": "chart-climate-acquisition-v1",
        "admin_unit_id": place["id"],
        "admin_unit_code": place["code"],
        "boundary_version": place["boundary_version"],
        "source_class": source_class,
        "months": sorted(month.isoformat() for month in months),
        **values,
    }


def _cds_credentials_available() -> bool:
    if os.getenv("CDSAPI_KEY"):
        return True
    credentials_file = Path(
        os.getenv("CDSAPI_RC", Path.home() / ".cdsapirc")
    ).expanduser()
    return credentials_file.is_file()


@contextmanager
def _prediction_lease_heartbeat(
    context: dg.OpExecutionContext,
    request_id: int,
    lease_token: str,
):
    """Keep ownership alive while a provider download blocks the worker."""

    stop = threading.Event()
    interval_seconds = max(5, int(os.getenv("PREDICTION_HEARTBEAT_SECONDS", "60")))

    def maintain_lease() -> None:
        while not stop.wait(interval_seconds):
            try:
                if not heartbeat_prediction_request(
                    request_id, lease_token=lease_token
                ):
                    context.log.error(
                        "Prediction request %s lost its lease during processing",
                        request_id,
                    )
                    return
            except Exception:
                # The foreground ownership checks remain authoritative. A
                # transient database outage here must not kill the download.
                context.log.exception(
                    "Could not heartbeat prediction request %s", request_id
                )

    thread = threading.Thread(
        target=maintain_lease,
        name=f"prediction-lease-{request_id}",
        daemon=True,
    )
    thread.start()
    try:
        yield
    finally:
        stop.set()
        thread.join(timeout=2)


def _ensure_climate_storage_capacity() -> None:
    output_dir = Path(os.getenv("CLIMATE_OUTPUT_DIR", DEFAULT_OUTDIR))
    output_dir.mkdir(parents=True, exist_ok=True)
    minimum_free_bytes = max(0, int(os.getenv("CLIMATE_MIN_FREE_BYTES", str(1024**3))))
    if shutil.disk_usage(output_dir).free < minimum_free_bytes:
        raise ClimateServiceError("CLIMATE_STORAGE_CAPACITY_LOW", 503)


defs = dg.Definitions(
    jobs=[prediction_request_job],
    sensors=[pending_prediction_requests_sensor],
)
