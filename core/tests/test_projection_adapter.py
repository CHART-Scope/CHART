from __future__ import annotations

from dataclasses import replace
from datetime import date, datetime, timezone

import pytest

from chart.climate.data_contract import build_climate_input_window
from chart.climate.projection_adapter import (
    ProjectionManifest,
    ProjectionMonthValue,
    adapt_projection_months,
)


def _manifest() -> ProjectionManifest:
    return ProjectionManifest(
        dataset_family="ISIMIP3b",
        dataset_name="InputData climate forcing",
        source_version="20210512 / DOI version 1.1",
        source_uri="s3://chart-climate/isimip3b/ssp126/GFDL-ESM4.nc",
        source_license="CC0 1.0",
        source_calendar="proleptic_gregorian",
        source_variable="tasmax",
        source_unit="K",
        scenario="ssp126",
        approved_scenarios=("ssp126", "ssp370", "ssp585"),
        model_member="GFDL-ESM4",
        bias_adjustment="w5e5",
        downscaling_method="native 0.5 degree area mean",
        generated_at=datetime(2026, 7, 21, 10, 0, tzinfo=timezone.utc),
        admin_unit_code="madhya-pradesh",
        admin_unit_level="state",
        boundary_version="mp-boundary-v1",
    )


def test_projection_adapter_normalizes_kelvin_and_builds_scorer_ready_window() -> None:
    records = adapt_projection_months(
        _manifest(),
        [
            ProjectionMonthValue(date(2049, 12, 1), 303.15),
            ProjectionMonthValue(date(2050, 1, 1), 304.15),
            ProjectionMonthValue(date(2050, 2, 1), 305.15),
        ],
    )

    window = build_climate_input_window(list(reversed(records)))

    assert window.tmax_lag == pytest.approx((32.0, 31.0, 30.0))
    assert {record.scenario for record in records} == {"ssp126"}
    assert {record.ensemble_member for record in records} == {"GFDL-ESM4"}
    assert {record.source_class for record in records} == {"projection"}
    assert {record.freshness_status for record in records} == {"not_applicable"}


def test_projection_adapter_refuses_unapproved_or_missing_scenario() -> None:
    values = [ProjectionMonthValue(date(2050, 1, 1), 304.15)]

    with pytest.raises(ValueError, match="SCENARIO_NOT_APPROVED"):
        adapt_projection_months(replace(_manifest(), scenario="ssp245"), values)
    with pytest.raises(ValueError, match="SCENARIO_NOT_APPROVED"):
        adapt_projection_months(replace(_manifest(), scenario=""), values)


def test_isimip3b_rejects_a_cmip6_scenario_outside_its_protocol_set() -> None:
    with pytest.raises(ValueError, match="SCENARIO_INVALID_FOR_ISIMIP3B"):
        adapt_projection_months(
            replace(
                _manifest(),
                scenario="ssp245",
                approved_scenarios=("ssp245",),
            ),
            [ProjectionMonthValue(date(2050, 1, 1), 304.15)],
        )


@pytest.mark.parametrize(
    "change",
    [
        {"source_variable": "tas"},
        {"aggregation_method": "monthly_mean_temperature"},
    ],
)
def test_projection_adapter_refuses_wrong_variable_or_aggregation(change) -> None:
    with pytest.raises(ValueError):
        adapt_projection_months(
            replace(_manifest(), **change),
            [ProjectionMonthValue(date(2050, 1, 1), 304.15)],
        )


def test_projection_adapter_rejects_duplicate_months() -> None:
    with pytest.raises(ValueError, match="DUPLICATE_MONTH"):
        adapt_projection_months(
            _manifest(),
            [
                ProjectionMonthValue(date(2050, 1, 1), 304.15),
                ProjectionMonthValue(date(2050, 1, 1), 305.15),
            ],
        )
