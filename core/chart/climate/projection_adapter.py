from __future__ import annotations

from calendar import monthrange
from dataclasses import dataclass
from datetime import date, datetime
from typing import Literal, Sequence

from .data_contract import MonthlyClimateRecord, validate_monthly_record

ProjectionDatasetFamily = Literal["ISIMIP3b", "CMIP6"]
ProjectionSourceUnit = Literal["K", "degC"]
_ISIMIP3B_SCENARIOS = {"historical", "ssp126", "ssp370", "ssp585"}


@dataclass(frozen=True)
class ProjectionManifest:
    """Approved metadata needed to interpret one long-term source artifact."""

    dataset_family: ProjectionDatasetFamily
    dataset_name: str
    source_version: str
    source_uri: str
    source_license: str
    source_calendar: str
    source_variable: str
    source_unit: ProjectionSourceUnit
    scenario: str
    approved_scenarios: tuple[str, ...]
    model_member: str
    bias_adjustment: str
    downscaling_method: str
    generated_at: datetime
    admin_unit_code: str
    admin_unit_level: str
    boundary_version: str
    aggregation_method: str = "polygon_cell_center_coslat_monthly_climatology_v1"
    projection_period_start: date | None = None
    projection_period_end: date | None = None


@dataclass(frozen=True)
class ProjectionMonthValue:
    period_month: date
    monthly_mean_daily_tmax: float


def adapt_projection_months(
    manifest: ProjectionManifest,
    values: Sequence[ProjectionMonthValue],
) -> list[MonthlyClimateRecord]:
    """Normalize prepared ISIMIP3b/CMIP6 values without calling a health model."""

    _validate_manifest(manifest)
    if not values:
        raise ValueError("CLIMATE_PROJECTION_VALUES_REQUIRED")

    seen_months: set[date] = set()
    records: list[MonthlyClimateRecord] = []
    for item in sorted(values, key=lambda value: value.period_month):
        if item.period_month in seen_months:
            raise ValueError(
                f"CLIMATE_PROJECTION_DUPLICATE_MONTH: {item.period_month:%Y-%m}"
            )
        seen_months.add(item.period_month)
        value_c = (
            item.monthly_mean_daily_tmax - 273.15
            if manifest.source_unit == "K"
            else item.monthly_mean_daily_tmax
        )
        record = MonthlyClimateRecord(
            period_month=item.period_month,
            value=value_c,
            admin_unit_code=manifest.admin_unit_code,
            admin_unit_level=manifest.admin_unit_level,
            boundary_version=manifest.boundary_version,
            aggregation_method=manifest.aggregation_method,
            source_class="projection",
            source_name=f"{manifest.dataset_family} {manifest.dataset_name}",
            source_version=manifest.source_version,
            source_uri=manifest.source_uri,
            source_license=manifest.source_license,
            source_calendar=manifest.source_calendar,
            data_label="projection",
            quality_status="validated",
            freshness_status="not_applicable",
            generated_at=manifest.generated_at,
            valid_from=manifest.projection_period_start or item.period_month,
            valid_to=manifest.projection_period_end
            or date(
                item.period_month.year,
                item.period_month.month,
                monthrange(item.period_month.year, item.period_month.month)[1],
            ),
            scenario=manifest.scenario,
            ensemble_member=manifest.model_member,
            bias_adjustment=manifest.bias_adjustment,
            downscaling_method=manifest.downscaling_method,
        )
        records.append(validate_monthly_record(record))
    return records


def _validate_manifest(manifest: ProjectionManifest) -> None:
    if manifest.dataset_family not in {"ISIMIP3b", "CMIP6"}:
        raise ValueError(
            f"CLIMATE_PROJECTION_DATASET_FAMILY_INVALID: {manifest.dataset_family}"
        )
    if manifest.scenario not in manifest.approved_scenarios:
        raise ValueError(
            f"CLIMATE_PROJECTION_SCENARIO_NOT_APPROVED: {manifest.scenario}"
        )
    if (
        manifest.dataset_family == "ISIMIP3b"
        and manifest.scenario not in _ISIMIP3B_SCENARIOS
    ):
        raise ValueError(
            f"CLIMATE_PROJECTION_SCENARIO_INVALID_FOR_ISIMIP3B: {manifest.scenario}"
        )
    if manifest.source_unit not in {"K", "degC"}:
        raise ValueError(
            f"CLIMATE_PROJECTION_SOURCE_UNIT_INVALID: {manifest.source_unit}"
        )
    if manifest.source_variable not in {
        "tasmax",
        "daily_maximum_near_surface_air_temperature",
    }:
        raise ValueError(
            f"CLIMATE_PROJECTION_VARIABLE_INVALID: {manifest.source_variable}"
        )
    if (
        manifest.aggregation_method
        != "polygon_cell_center_coslat_monthly_climatology_v1"
    ):
        raise ValueError(
            "CLIMATE_PROJECTION_AGGREGATION_INVALID: " f"{manifest.aggregation_method}"
        )
