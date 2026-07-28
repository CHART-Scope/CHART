from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Literal, cast

from sqlalchemy import select
from sqlalchemy.orm import Session

from chart.inference import InferenceError, score_lbw
from chart.model_registry.service import (
    ActiveModelMapping,
    get_active_model_mapping,
    get_active_model_mappings,
    get_model_mapping,
)
from chart.shared.db.models import (
    AdminUnit,
    AppGeography,
    ClimateInputWindowRecord,
    ClimateRun,
    DataSource,
    DistrictClimate,
    Provenance,
)
from chart.shared.db.session import get_session_factory

from .input_windows import (
    read_input_values,
    select_input_months,
)
from .planning_targets import planning_options_for_place
from .schemas import (
    Availability,
    AvailabilityStatus,
    ClimateMonthStatus,
    ClimateMonthResponse,
    LbwPrediction,
    LongTermProjectionOptionResponse,
    PlaceListResponse,
    PlaceResponse,
    HeatSeasonOptionResponse,
    PlanningOptionsResponse,
    PlanningTarget,
    ProjectionPeriod,
    ProjectionScenario,
    ProjectionScenarioOptionResponse,
    PredictRequest,
    PredictResponse,
    PreviewRequest,
    PreviewResponse,
)
from .source_policy import resolve_month_source


class ClimateServiceError(Exception):
    def __init__(self, code: str, status_code: int, detail: str = "") -> None:
        super().__init__(code)
        self.code = code
        self.status_code = status_code
        self.detail = detail


@dataclass(frozen=True)
class ResolvedPlace:
    geography: AppGeography
    admin_unit: AdminUnit
    model: ActiveModelMapping | None


def list_locations(*, session_factory=None) -> PlaceListResponse:
    session_factory = session_factory or get_session_factory()
    with session_factory() as session:
        rows = session.execute(
            select(AppGeography, AdminUnit)
            .join(AdminUnit, AdminUnit.app_geography_id == AppGeography.id)
            .order_by(
                AppGeography.country_code, AppGeography.sort_order, AppGeography.name
            )
        ).all()
        models = get_active_model_mappings(
            session, [admin_unit.id for _, admin_unit in rows]
        )
        return PlaceListResponse(
            items=[
                _place_response(
                    place,
                    admin_unit=admin_unit,
                    model=models.get(admin_unit.id),
                )
                for place, admin_unit in rows
            ]
        )


def get_place_path(geography_id: str, *, session_factory=None) -> str:
    session_factory = session_factory or get_session_factory()
    with session_factory() as session:
        return _resolve_place(session, geography_id).geography.path


def get_planning_options(
    geography_id: str,
    *,
    session_factory=None,
    now: datetime | None = None,
) -> PlanningOptionsResponse:
    session_factory = session_factory or get_session_factory()
    with session_factory() as session:
        place = _resolve_place(session, geography_id)
        options = planning_options_for_place(
            place.admin_unit.code,
            geography_path=place.geography.path,
            now=now,
        )
        validated_windows = cast(
            list[Literal[1, 2, 3]],
            list(place.model.validated_pregnancy_windows) if place.model else [],
        )
        return PlanningOptionsResponse(
            geography_id=geography_id,
            source_as_of=options.source_as_of,
            validated_pregnancy_windows=validated_windows,
            model_result_mode=(
                "single_association"
                if len(validated_windows) == 1
                else "pregnancy_windows"
            ),
            custom_min_month=options.custom_min_month,
            custom_max_month=options.custom_max_month,
            next_three_months=HeatSeasonOptionResponse(
                label=options.next_three_months.label,
                months=list(options.next_three_months.months),
                planning_date=options.next_three_months.planning_date,
                available=options.next_three_months.available,
                available_from=options.next_three_months.available_from,
                unavailable_reason=options.next_three_months.unavailable_reason,
                source_name=options.next_three_months.source_name,
                source_uri=options.next_three_months.source_uri,
            ),
            next_heat_season=(
                HeatSeasonOptionResponse(
                    label=options.next_heat_season.label,
                    months=list(options.next_heat_season.months),
                    planning_date=options.next_heat_season.planning_date,
                    available=options.next_heat_season.available,
                    available_from=options.next_heat_season.available_from,
                    unavailable_reason=options.next_heat_season.unavailable_reason,
                    source_name=options.next_heat_season.source_name,
                    source_uri=options.next_heat_season.source_uri,
                )
                if options.next_heat_season
                else None
            ),
            long_term_projection=(
                LongTermProjectionOptionResponse(
                    label=options.long_term_projection.label,
                    period=options.long_term_projection.period,
                    months=list(options.long_term_projection.months),
                    planning_date=options.long_term_projection.planning_date,
                    scenarios=[
                        ProjectionScenarioOptionResponse(
                            value=scenario.value,
                            label=scenario.label,
                            description=scenario.description,
                        )
                        for scenario in options.long_term_projection.scenarios
                    ],
                    source_name=options.long_term_projection.source_name,
                    source_uri=options.long_term_projection.source_uri,
                )
                if options.long_term_projection
                else None
            ),
        )


def preview(
    request: PreviewRequest,
    *,
    session_factory=None,
    now: datetime | None = None,
) -> PreviewResponse:
    session_factory = session_factory or get_session_factory()
    with session_factory() as session:
        place = _resolve_place(session, request.geography_id)
        return _build_preview(session, place, request.planning_date, now=now)


def score_prepared_prediction(
    session_factory,
    *,
    request_id: int,
    geography_id: str,
    planning_date: date,
    admin_unit_id: int,
    climate_input_window_id: int,
    model_release_id: str,
    expected_model_sha256: str,
    pregnancy_window: int,
    source_as_of: datetime | None = None,
    lbw_service_url: str | None = None,
    planning_target: PlanningTarget = "month",
    projection_scenario: ProjectionScenario | None = None,
    projection_period: ProjectionPeriod | None = None,
) -> PredictResponse:
    # Read and validate all immutable inputs, then release the database
    # connection before the network call to the scorer.
    with session_factory() as session:
        place = _resolve_place(session, geography_id)
        if place.admin_unit.id != admin_unit_id:
            raise ClimateServiceError("PREDICTION_PLACE_MISMATCH", 409)
        model = get_model_mapping(
            session,
            release_id=model_release_id,
            admin_unit_id=admin_unit_id,
        )
        if model is None:
            raise ClimateServiceError("MODEL_RELEASE_NOT_AVAILABLE_FOR_PLACE", 409)
        if model.artifact_sha256 != expected_model_sha256:
            raise ClimateServiceError("MODEL_REQUEST_ARTIFACT_MISMATCH", 409)
        if pregnancy_window not in model.validated_pregnancy_windows:
            raise ClimateServiceError("MODEL_PREGNANCY_WINDOW_NOT_VALIDATED", 409)
        # A queued request is pinned to its submitted release even if a newer
        # release becomes active before scoring.
        place = ResolvedPlace(
            geography=place.geography,
            admin_unit=place.admin_unit,
            model=model,
        )

        stored_window = session.get(ClimateInputWindowRecord, climate_input_window_id)
        if stored_window is None or stored_window.admin_unit_id != admin_unit_id:
            raise ClimateServiceError("CLIMATE_INPUT_NOT_FOUND", 409)
        rows = read_input_values(session, climate_input_window_id)
        if len(rows) != 3:
            raise ClimateServiceError("CLIMATE_DATA_NOT_READY", 409)
        if any(row[0].admin_unit_id != admin_unit_id for row in rows):
            raise ClimateServiceError("CLIMATE_INPUT_ADMIN_MISMATCH", 409)
        temperatures = (
            float(rows[0][0].value),
            float(rows[1][0].value),
            float(rows[2][0].value),
        )
        preview_body = _build_preview(
            session,
            place,
            planning_date,
            input_window_id=climate_input_window_id,
            now=source_as_of,
            projection_scenario=projection_scenario,
            projection_period=projection_period,
        )
        model_area_name = model.model_area_name
        model_file = model.model_file
        model_version = model.version
        model_sha256 = model.artifact_sha256

    try:
        score = score_lbw(
            model_area=model_area_name,
            pregnancy_window=pregnancy_window,
            temperatures_c=temperatures,
            service_url=lbw_service_url,
            expected_model_version=model_version,
            expected_model_sha256=model_sha256,
        )
    except InferenceError as error:
        unavailable_errors = {
            "LBW_SERVICE_NOT_CONFIGURED",
            "LBW_SERVICE_TIMEOUT",
            "LBW_SERVICE_UNAVAILABLE",
            "LBW_CIRCUIT_OPEN",
        }
        status = 503 if error.code in unavailable_errors else 502
        raise ClimateServiceError(error.code, status, error.detail) from error

    if score.area != model_area_name:
        raise ClimateServiceError("MODEL_AREA_RESPONSE_MISMATCH", 502)
    if Path(score.model_file).name != Path(model_file).name:
        raise ClimateServiceError("MODEL_FILE_RESPONSE_MISMATCH", 502)
    if score.model_sha256 != model_sha256:
        raise ClimateServiceError("MODEL_CHECKSUM_RESPONSE_MISMATCH", 502)
    prediction = LbwPrediction(
        area=score.area,
        geography_level=score.geography_level,
        pregnancy_window=score.pregnancy_window,
        temperatures_c=list(score.temperatures_c),
        reference_temperature_c=score.reference_temperature_c,
        odds_ratio=score.odds_ratio,
        ci95_low=score.ci95_low,
        ci95_high=score.ci95_high,
        on_training_support=score.on_training_support,
        model_file=score.model_file,
        model_version=model_version,
        model_sha256=score.model_sha256,
        warning=score.warning,
        explanation=None,
    )
    return PredictResponse(
        **preview_body.model_dump(),
        prediction=prediction,
        request_id=request_id,
        planning_target=planning_target,
        projection_scenario=projection_scenario,
        projection_period=projection_period,
    )


def validate_prediction_request(
    request: PredictRequest, *, session_factory=None
) -> ResolvedPlace:
    session_factory = session_factory or get_session_factory()
    with session_factory() as session:
        place = _resolve_place(session, request.geography_id)
        if place.model is None:
            raise ClimateServiceError("MODEL_NOT_AVAILABLE_FOR_PLACE", 409)
        return place


def climate_for_request(
    *,
    geography_id: str,
    planning_date: date,
    input_window_id: int | None,
    session_factory=None,
    now: datetime | None = None,
    projection_scenario: str | None = None,
    projection_period: str | None = None,
) -> list[ClimateMonthResponse]:
    session_factory = session_factory or get_session_factory()
    with session_factory() as session:
        place = _resolve_place(session, geography_id)
        return _climate_months(
            session,
            place,
            planning_date,
            input_window_id=input_window_id,
            now=now,
            projection_scenario=projection_scenario,
            projection_period=projection_period,
        )


def _build_preview(
    session: Session,
    place: ResolvedPlace,
    planning_date: date,
    *,
    input_window_id: int | None = None,
    now: datetime | None = None,
    projection_scenario: str | None = None,
    projection_period: str | None = None,
) -> PreviewResponse:
    current_time = now or datetime.now(timezone.utc)
    climate = _climate_months(
        session,
        place,
        planning_date,
        input_window_id=input_window_id,
        now=current_time,
        projection_scenario=projection_scenario,
        projection_period=projection_period,
    )
    ready = [item for item in climate if item.status in {"ready", "sample"}]
    missing = [item.month for item in climate if item.temperature_c is None]
    has_sample = any(item.status == "sample" for item in climate)
    has_stale = any(item.status == "stale" for item in climate)
    if missing:
        status = "missing" if not ready else "partial"
        message = "Climate data is still being prepared."
    elif has_stale:
        status = "stale"
        message = "Climate data exists but is too old for a live prediction."
    elif has_sample:
        status = "sample"
        message = "Sample climate data is ready for local testing."
    else:
        status = "ready"
        message = "All three climate months are ready."

    stored_window = (
        session.get(ClimateInputWindowRecord, input_window_id)
        if input_window_id is not None
        else None
    )
    return PreviewResponse(
        place=_place_response(
            place.geography,
            admin_unit=place.admin_unit,
            model=place.model,
        ),
        planning_date=planning_date,
        source_as_of=current_time.date(),
        availability=Availability(
            status=cast(AvailabilityStatus, status),
            months_found=len(ready),
            missing_months=missing,
            input_window_id=stored_window.id if stored_window else None,
            input_hash=stored_window.input_hash if stored_window else None,
            message=message,
        ),
        climate=climate,
    )


def _climate_months(
    session: Session,
    place: ResolvedPlace,
    planning_date: date,
    *,
    input_window_id: int | None,
    now: datetime | None = None,
    projection_scenario: str | None = None,
    projection_period: str | None = None,
) -> list[ClimateMonthResponse]:
    current_time = now or datetime.now(timezone.utc)
    if input_window_id is not None:
        rows = read_input_values(session, input_window_id)
        if rows:
            return [_month_response(row, current_time=current_time) for row in rows]

    selected = select_input_months(
        session,
        admin_unit_id=place.admin_unit.id,
        target_end_month=planning_date,
        now=current_time,
        projection_scenario=projection_scenario,
        projection_period=projection_period,
    )
    responses: list[ClimateMonthResponse] = []
    for month, row in selected:
        decision = resolve_month_source(
            month,
            now=current_time,
            projection_scenario=projection_scenario,
            projection_period=projection_period,
        )
        if row is None:
            responses.append(
                ClimateMonthResponse(
                    month=month.strftime("%Y-%m"),
                    status="waiting",
                    expected_source_class=decision.source_class,
                    expected_source_name=decision.source_name,
                    source_policy_version=decision.policy_version,
                    unavailable_reason=decision.unavailable_reason,
                )
            )
        else:
            responses.append(
                _month_response(
                    row,
                    current_time=current_time,
                    now=current_time,
                    projection_scenario=projection_scenario,
                    projection_period=projection_period,
                )
            )
    return responses


def _month_response(
    row: tuple[DistrictClimate, ClimateRun, DataSource, Provenance],
    *,
    current_time: datetime,
    now: datetime | None = None,
    projection_scenario: str | None = None,
    projection_period: str | None = None,
) -> ClimateMonthResponse:
    value, run, source, provenance = row
    decision = resolve_month_source(
        value.period_month,
        now=now or current_time,
        projection_scenario=projection_scenario or run.scenario,
        projection_period=(
            projection_period
            or (
                f"{run.window_start_year:04d}-{run.window_end_year:04d}"
                if run.source_class == "projection"
                and run.window_start_year is not None
                and run.window_end_year is not None
                else None
            )
        ),
    )
    label = run.data_label.value
    status = "sample" if label == "sample" else "ready"
    if (
        run.source_class != "projection"
        and (
            run.fresh_until is None
            or _aware(run.fresh_until) < _aware(current_time)
        )
    ):
        status = "stale"
    return ClimateMonthResponse(
        month=value.period_month.strftime("%Y-%m"),
        temperature_c=float(value.value),
        status=cast(ClimateMonthStatus, status),
        source_name=run.source_name or source.name,
        source_class=run.source_class or run.tier,
        source_uri=run.source_uri or source.source_uri,
        source_issue_time=_iso(run.issue_time),
        downloaded_at=_iso(run.generated_at or provenance.created_at),
        data_label=label,
        quality_status=value.quality_status or run.quality_status,
        climate_run_id=run.id,
        raw_file_uri=run.raw_object_uri or provenance.source_uri,
        raw_file_hash=run.raw_object_hash or provenance.input_hash,
        scenario=run.scenario,
        projection_period=(
            f"{run.window_start_year:04d}-{run.window_end_year:04d}"
            if run.source_class == "projection"
            and run.window_start_year is not None
            and run.window_end_year is not None
            else None
        ),
        ensemble_summary=run.ensemble_summary,
        expected_source_class=decision.source_class,
        expected_source_name=decision.source_name,
        source_policy_version=decision.policy_version,
        unavailable_reason=decision.unavailable_reason,
    )


def _resolve_place(session: Session, geography_id: str) -> ResolvedPlace:
    geography = session.get(AppGeography, geography_id)
    if geography is None:
        raise ClimateServiceError("GEOGRAPHY_NOT_FOUND", 404)
    admin_unit = session.scalar(
        select(AdminUnit).where(AdminUnit.app_geography_id == geography.id)
    )
    if admin_unit is None:
        raise ClimateServiceError("CLIMATE_NOT_CONFIGURED_FOR_PLACE", 409)
    model = get_active_model_mapping(session, admin_unit_id=admin_unit.id)
    return ResolvedPlace(geography=geography, admin_unit=admin_unit, model=model)


def _place_response(
    geography: AppGeography,
    *,
    admin_unit: AdminUnit | None,
    model: ActiveModelMapping | None,
) -> PlaceResponse:
    return PlaceResponse(
        geography_id=geography.id,
        code=admin_unit.code if admin_unit is not None else geography.id,
        name=geography.name,
        level=geography.level_label,
        path=geography.path,
        supports_prediction=model is not None,
        model_version=model.version if model else None,
    )


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
