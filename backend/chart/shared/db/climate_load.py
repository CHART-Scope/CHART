from __future__ import annotations

import hashlib
import json
import math
from calendar import monthrange
from datetime import date, datetime, timedelta, timezone
from typing import cast

import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from chart.climate.data_contract import (
    ClimateDataLabel,
    ClimateQualityStatus,
    MonthlyClimateRecord,
    validate_monthly_record,
)

from .models import (
    AdminUnit,
    ClimateRun,
    DataLabel,
    DataSource,
    DistrictClimate,
    Geography,
    Provenance,
)

ERA5_DATA_SOURCE_NAME = "Copernicus ERA5 single levels"


def load_monthly_climate_records(
    session: Session,
    *,
    admin_unit: AdminUnit,
    records: list[MonthlyClimateRecord],
    raw_object_uri: str,
    raw_object_hash: str,
    provider: str,
    product: str,
    access_method: str,
) -> ClimateRun:
    """Persist validated provider output without any model dependency."""

    if not records:
        raise ValueError("CLIMATE_RECORDS_REQUIRED")
    validated = [validate_monthly_record(record) for record in records]
    if any(record.admin_unit_code != admin_unit.code for record in validated):
        raise ValueError("CLIMATE_ADMIN_UNIT_MISMATCH")
    input_hash = hashlib.sha256(
        json.dumps(
            [record.record_hash for record in validated],
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()
    existing = session.scalar(
        select(ClimateRun).where(ClimateRun.input_hash == input_hash)
    )
    if existing is not None:
        return existing

    first = validated[0]
    source_revision = (
        first.source_name,
        first.source_version,
        first.source_uri,
        first.source_license,
    )
    if any(
        (
            record.source_name,
            record.source_version,
            record.source_uri,
            record.source_license,
        )
        != source_revision
        for record in validated[1:]
    ):
        raise ValueError("CLIMATE_SOURCE_REVISION_MISMATCH")
    geography = session.get(Geography, admin_unit.geography_id)
    if geography is None:
        raise ValueError("CLIMATE_GEOGRAPHY_NOT_FOUND")
    data_source = session.scalar(
        select(DataSource).where(
            DataSource.name == first.source_name,
            DataSource.geography_id == geography.id,
        )
    )
    if data_source is None:
        data_source = DataSource(
            name=first.source_name,
            kind=first.source_class,
            provider=provider,
            product=product,
            version=first.source_version,
            access_method=access_method,
            source_uri=first.source_uri,
            license=first.source_license,
            cadence="monthly",
            geography_id=geography.id,
        )
        session.add(data_source)
        session.flush()
    else:
        data_source.version = first.source_version
        data_source.source_uri = first.source_uri
        data_source.last_refreshed_at = datetime.now(timezone.utc)

    provenance = Provenance(
        source_uri=raw_object_uri,
        input_hash=raw_object_hash,
        license=first.source_license,
    )
    session.add(provenance)
    session.flush()
    climate_run = ClimateRun(
        data_source_id=data_source.id,
        provenance_id=provenance.id,
        tier=first.source_class,
        source_class=first.source_class,
        source_name=first.source_name,
        source_version=first.source_version,
        source_uri=first.source_uri,
        source_license=first.source_license,
        input_hash=input_hash,
        scenario=first.scenario,
        resolution=None,
        data_label=DataLabel(first.data_label),
        window_start_year=min(record.valid_from for record in validated).year,
        window_end_year=max(record.valid_to for record in validated).year,
        generated_at=max(record.generated_at for record in validated),
        issue_time=first.issue_time,
        valid_from=min(record.valid_from for record in validated),
        valid_to=max(record.valid_to for record in validated),
        fresh_until=min(
            (
                record.fresh_until
                for record in validated
                if record.fresh_until is not None
            ),
            default=None,
        ),
        ensemble_summary=first.ensemble_member,
        bias_adjustment=first.bias_adjustment,
        boundary_version=first.boundary_version,
        aggregation_version=first.aggregation_method,
        downscaling_method=first.downscaling_method,
        quality_status=first.quality_status,
        raw_object_uri=raw_object_uri,
        raw_object_hash=raw_object_hash,
    )
    session.add(climate_run)
    session.flush()
    for record in validated:
        session.add(
            DistrictClimate(
                admin_unit_id=admin_unit.id,
                climate_run_id=climate_run.id,
                period_month=record.period_month,
                variable=record.variable,
                value=record.value,
                agg_method=record.aggregation_method,
                unit=record.unit,
                quality_status=record.quality_status,
                record_hash=record.record_hash,
            )
        )
    _touch_data_source(data_source)
    return climate_run


def _touch_data_source(data_source: DataSource) -> None:
    data_source.last_refreshed_at = datetime.now(timezone.utc)


def _get_or_create_era5_data_source(session: Session, geography_id: int) -> DataSource:
    data_source = session.scalar(
        select(DataSource).where(
            DataSource.name == ERA5_DATA_SOURCE_NAME,
            DataSource.geography_id == geography_id,
        )
    )
    if data_source is None:
        data_source = DataSource(
            name=ERA5_DATA_SOURCE_NAME,
            kind="reanalysis",
            provider="Copernicus Climate Change Service",
            product="reanalysis-era5-single-levels",
            version="ERA5 hourly data on single levels",
            access_method="cds_api",
            source_uri=(
                "https://cds.climate.copernicus.eu/datasets/"
                "reanalysis-era5-single-levels"
            ),
            license="Copernicus Licence",
            cadence="monthly",
            geography_id=geography_id,
        )
        session.add(data_source)
        session.flush()
    else:
        data_source.provider = "Copernicus Climate Change Service"
        data_source.product = "reanalysis-era5-single-levels"
        data_source.version = "ERA5 hourly data on single levels"
        data_source.access_method = "cds_api"
        data_source.source_uri = (
            "https://cds.climate.copernicus.eu/datasets/"
            "reanalysis-era5-single-levels"
        )
        data_source.license = "Copernicus Licence"
    return data_source


ERA5_VARIABLES = (
    ("tmax_monthly_mean_c", "degC"),
    ("tmax_monthly_max_c", "degC"),
    ("heatwave_days", "days"),
)


def _parse_month(value) -> date:
    ts = pd.to_datetime(value)
    return date(int(ts.year), int(ts.month), 1)


def ensure_mvp_geographies(session: Session) -> dict[str, tuple[Geography, AdminUnit]]:
    """Seed the two MVP geographies used by era5_heat presets."""
    from era5_heat.districts import PRESETS

    out: dict[str, tuple[Geography, AdminUnit]] = {}
    for slug, preset in PRESETS.items():
        geography = session.scalar(select(Geography).where(Geography.slug == slug))
        if geography is None:
            geography = Geography(slug=slug, country=preset.country, name=preset.name)
            session.add(geography)
            session.flush()

        admin_unit = session.scalar(
            select(AdminUnit).where(
                AdminUnit.geography_id == geography.id,
                AdminUnit.code == slug,
            )
        )
        if admin_unit is None:
            north, west, south, east = preset.bbox
            admin_unit = AdminUnit(
                geography_id=geography.id,
                level="state" if slug == "madhya-pradesh" else "county",
                code=slug,
                name=preset.name,
                bbox_north=north,
                bbox_west=west,
                bbox_south=south,
                bbox_east=east,
                note=preset.note,
            )
            session.add(admin_unit)
            session.flush()

        out[slug] = (geography, admin_unit)

    return out


def load_era5_monthly_frame(
    session: Session,
    *,
    preset_slug: str,
    admin_unit_code: str | None = None,
    admin_unit_id: int | None = None,
    df: pd.DataFrame,
    meta: dict,
    csv_path: str,
    allow_sample: bool = False,
) -> ClimateRun:
    """Upsert one observed ERA5 run and monthly district_climate rows."""
    if admin_unit_id is not None:
        admin_unit = session.get(AdminUnit, admin_unit_id)
        if admin_unit is None:
            raise KeyError(f"unknown admin unit id: {admin_unit_id}")
        geography = session.get(Geography, admin_unit.geography_id)
        if geography is None:
            raise KeyError(f"unknown geography for admin unit: {admin_unit_id}")
    else:
        geographies = ensure_mvp_geographies(session)
        if preset_slug not in geographies:
            raise KeyError(f"unknown preset slug: {preset_slug}")
        geography, admin_unit = geographies[preset_slug]
    if admin_unit_code is not None and admin_unit_id is None:
        selected_admin_unit = session.scalar(
            select(AdminUnit).where(
                AdminUnit.geography_id == geography.id,
                AdminUnit.code == admin_unit_code,
            )
        )
        if selected_admin_unit is None:
            raise KeyError(f"unknown admin unit code: {admin_unit_code}")
        admin_unit = selected_admin_unit
    records, input_hash, data_label = audit_era5_monthly_frame(
        preset_slug=preset_slug,
        admin_unit=admin_unit,
        df=df,
        meta=meta,
        csv_path=csv_path,
        allow_sample=allow_sample,
    )

    existing = session.scalar(
        select(ClimateRun).where(ClimateRun.input_hash == input_hash)
    )
    data_source = _get_or_create_era5_data_source(session, geography.id)

    if existing is not None:
        _touch_data_source(data_source)
        return existing

    provenance = Provenance(
        source_uri=csv_path,
        input_hash=input_hash,
        license="Copernicus CDS terms",
    )
    session.add(provenance)
    session.flush()

    climate_run = ClimateRun(
        data_source_id=data_source.id,
        provenance_id=provenance.id,
        tier="observed",
        source_class="observed",
        source_name=records[0].source_name,
        source_version=records[0].source_version,
        source_uri=records[0].source_uri,
        source_license=records[0].source_license,
        input_hash=input_hash,
        scenario=None,
        resolution="ERA5 0.25 deg bbox aggregate",
        data_label=data_label,
        window_start_year=meta.get("window", {}).get("start_year"),
        window_end_year=meta.get("window", {}).get("end_year"),
        generated_at=(
            datetime.fromisoformat(meta["generated_at"])
            if meta.get("generated_at")
            else None
        ),
        valid_from=records[0].valid_from,
        valid_to=records[-1].valid_to,
        fresh_until=records[-1].fresh_until,
        boundary_version=records[0].boundary_version,
        aggregation_version=records[0].aggregation_method,
        downscaling_method=records[0].downscaling_method,
        quality_status=records[0].quality_status,
        raw_object_uri=csv_path,
        raw_object_hash=input_hash,
    )
    session.add(climate_run)
    session.flush()

    rows_by_month = {_parse_month(row["month"]): row for _, row in df.iterrows()}
    for record in records:
        row = rows_by_month[record.period_month]
        for variable, unit in ERA5_VARIABLES:
            value = float(row[variable])
            session.add(
                DistrictClimate(
                    admin_unit_id=admin_unit.id,
                    climate_run_id=climate_run.id,
                    period_month=record.period_month,
                    variable=variable,
                    value=value,
                    agg_method=record.aggregation_method,
                    unit=unit,
                    observed_days=(
                        int(row["observed_days"])
                        if "observed_days" in row and not pd.isna(row["observed_days"])
                        else None
                    ),
                    expected_days=(
                        int(row["expected_days"])
                        if "expected_days" in row and not pd.isna(row["expected_days"])
                        else None
                    ),
                    quality_status=record.quality_status,
                    record_hash=record.record_hash,
                )
            )

    _touch_data_source(data_source)
    return climate_run


def audit_era5_monthly_frame(
    *,
    preset_slug: str,
    admin_unit: AdminUnit,
    df: pd.DataFrame,
    meta: dict,
    csv_path: str,
    allow_sample: bool = False,
) -> tuple[list[MonthlyClimateRecord], str, DataLabel]:
    """Validate ERA5 handoff data and translate it to the canonical contract."""

    required_columns = {"month", *(variable for variable, _ in ERA5_VARIABLES)}
    missing_columns = sorted(required_columns - set(df.columns))
    if missing_columns:
        raise ValueError(f"ERA5_REQUIRED_COLUMNS_MISSING: {missing_columns}")
    if df.empty:
        raise ValueError("ERA5_FRAME_EMPTY")
    if not csv_path.strip():
        raise ValueError("ERA5_SOURCE_URI_REQUIRED")

    status_map = {
        "observed_reanalysis": DataLabel.reanalysis,
        "reanalysis": DataLabel.reanalysis,
        "observed": DataLabel.observed,
        "sample": DataLabel.sample,
    }
    status = meta.get("data_status")
    if status not in status_map:
        raise ValueError(f"ERA5_DATA_STATUS_INVALID: {status!r}")
    data_label = status_map[status]
    if data_label == DataLabel.sample and not allow_sample:
        raise ValueError("CLIMATE_SAMPLE_NOT_LIVE")

    source_name = _required_meta_text(meta, "source")
    source_version = _required_meta_text(meta, "source_version")
    generated_at = _parse_aware_datetime(meta.get("generated_at"))
    boundary_version = admin_unit.boundary_version or _bbox_boundary_version(
        preset_slug, admin_unit
    )
    aggregation_method = str(meta.get("aggregation_method") or "bbox_coslat_mean_v1")
    downscaling_method = str(meta.get("downscaling_method") or "none")

    normalized_rows: list[tuple[date, dict[str, float]]] = []
    seen_months: set[date] = set()
    for _, row in df.iterrows():
        period_month = _parse_month(row["month"])
        if period_month in seen_months:
            raise ValueError(f"ERA5_DUPLICATE_MONTH: {period_month:%Y-%m}")
        seen_months.add(period_month)

        values: dict[str, float] = {}
        for variable, _ in ERA5_VARIABLES:
            value = float(row[variable])
            if not math.isfinite(value):
                raise ValueError(f"ERA5_VALUE_INVALID: {variable} {period_month:%Y-%m}")
            values[variable] = value
        if values["tmax_monthly_max_c"] < values["tmax_monthly_mean_c"]:
            raise ValueError(f"ERA5_TMAX_ORDER_INVALID: {period_month:%Y-%m}")
        if values["heatwave_days"] < 0:
            raise ValueError(f"ERA5_HEATWAVE_DAYS_INVALID: {period_month:%Y-%m}")
        normalized_rows.append((period_month, values))

    normalized_rows.sort(key=lambda item: item[0])
    normalized_months = [month for month, _ in normalized_rows]
    if meta.get("requested_months") is None:
        _validate_contiguous_months(normalized_months)
    _validate_window_metadata(meta, normalized_months)
    _validate_complete_months(df)
    _validate_handoff_columns(df, meta)

    quality_status: ClimateQualityStatus = (
        "sample" if data_label == DataLabel.sample else "validated"
    )
    contract_data_label = cast(ClimateDataLabel, data_label.value)
    # Completed reanalysis months remain valid historical observations. A later
    # source release creates a new run rather than making the old values disappear.
    fresh_until = generated_at + timedelta(days=3650)
    records: list[MonthlyClimateRecord] = []
    for period_month, values in normalized_rows:
        record = MonthlyClimateRecord(
            period_month=period_month,
            value=values["tmax_monthly_mean_c"],
            admin_unit_code=admin_unit.code,
            admin_unit_level=admin_unit.level,
            boundary_version=boundary_version,
            aggregation_method=aggregation_method,
            source_class="observed",
            source_name=source_name,
            source_version=source_version,
            source_uri=csv_path,
            source_license="Copernicus CDS terms",
            source_calendar="gregorian",
            data_label=contract_data_label,
            quality_status=quality_status,
            freshness_status="current",
            generated_at=generated_at,
            valid_from=period_month,
            valid_to=date(
                period_month.year,
                period_month.month,
                monthrange(period_month.year, period_month.month)[1],
            ),
            fresh_until=fresh_until,
            downscaling_method=downscaling_method,
        )
        records.append(validate_monthly_record(record))

    hash_payload = {
        "contract_version": records[0].contract_version,
        "metadata": meta,
        "records": [
            {
                "record_hash": record.record_hash,
                **values,
            }
            for record, (_, values) in zip(records, normalized_rows, strict=True)
        ],
    }
    input_hash = hashlib.sha256(
        json.dumps(
            hash_payload,
            sort_keys=True,
            separators=(",", ":"),
            default=str,
        ).encode("utf-8")
    ).hexdigest()
    return records, input_hash, data_label


def _required_meta_text(meta: dict, key: str) -> str:
    value = meta.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"ERA5_METADATA_REQUIRED: {key}")
    return value


def _parse_aware_datetime(value) -> datetime:
    if not isinstance(value, str):
        raise ValueError("ERA5_GENERATED_AT_REQUIRED")
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as error:
        raise ValueError("ERA5_GENERATED_AT_INVALID") from error
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError("ERA5_GENERATED_AT_TIMEZONE_REQUIRED")
    return parsed


def _bbox_boundary_version(preset_slug: str, admin_unit: AdminUnit) -> str:
    coordinates = (
        admin_unit.bbox_north,
        admin_unit.bbox_west,
        admin_unit.bbox_south,
        admin_unit.bbox_east,
    )
    if any(value is None for value in coordinates):
        raise ValueError(f"ERA5_BBOX_REQUIRED: {preset_slug}")
    digest = hashlib.sha256(
        json.dumps([preset_slug, *coordinates], separators=(",", ":")).encode("utf-8")
    ).hexdigest()[:16]
    return f"preset-bbox-sha256:{digest}"


def _validate_contiguous_months(months: list[date]) -> None:
    for previous, current in zip(months, months[1:]):
        expected = (
            date(previous.year + 1, 1, 1)
            if previous.month == 12
            else date(previous.year, previous.month + 1, 1)
        )
        if current != expected:
            raise ValueError(
                f"ERA5_MONTH_GAP: expected {expected:%Y-%m}, got {current:%Y-%m}"
            )


def _validate_window_metadata(meta: dict, months: list[date]) -> None:
    window = meta.get("window")
    if not isinstance(window, dict):
        raise ValueError("ERA5_WINDOW_METADATA_REQUIRED")
    if window.get("start_year") != months[0].year:
        raise ValueError("ERA5_WINDOW_START_MISMATCH")
    if window.get("end_year") != months[-1].year:
        raise ValueError("ERA5_WINDOW_END_MISMATCH")
    expected_years = months[-1].year - months[0].year + 1
    if window.get("n_years") != expected_years:
        raise ValueError("ERA5_WINDOW_LENGTH_MISMATCH")
    requested_values = meta.get("requested_months")
    if requested_values is not None:
        if not isinstance(requested_values, list):
            raise ValueError("ERA5_REQUESTED_MONTHS_INVALID")
        try:
            requested_months = [
                date.fromisoformat(str(value)).replace(day=1)
                for value in requested_values
            ]
        except ValueError as error:
            raise ValueError("ERA5_REQUESTED_MONTHS_INVALID") from error
        if requested_months != months:
            raise ValueError("ERA5_REQUESTED_MONTHS_MISMATCH")
        return
    if months[0].month != 1 or months[-1].month != 12:
        raise ValueError("ERA5_WINDOW_INCOMPLETE_YEAR")
    if len(months) != expected_years * 12:
        raise ValueError("ERA5_WINDOW_MONTH_COUNT_MISMATCH")


def _validate_complete_months(df: pd.DataFrame) -> None:
    if "observed_days" in df.columns and "expected_days" in df.columns:
        incomplete = df["observed_days"].astype(int) != df["expected_days"].astype(int)
        if bool(incomplete.any()):
            raise ValueError("ERA5_MONTH_INCOMPLETE")
    if "quality_flag" in df.columns:
        flags = {str(value) for value in df["quality_flag"].dropna().unique()}
        if flags != {"complete"}:
            raise ValueError("ERA5_MONTH_INCOMPLETE")


def _validate_handoff_columns(df: pd.DataFrame, meta: dict) -> None:
    comparisons = {
        "climate_source": meta.get("source"),
        "climate_source_version": meta.get("source_version"),
        "data_status": meta.get("data_status"),
        "generated_at": meta.get("generated_at"),
    }
    for column, expected in comparisons.items():
        if column not in df.columns:
            continue
        actual = {str(value) for value in df[column].dropna().unique()}
        if actual != {str(expected)}:
            raise ValueError(f"ERA5_HANDOFF_METADATA_MISMATCH: {column}")
