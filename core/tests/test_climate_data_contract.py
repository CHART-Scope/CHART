from __future__ import annotations

from dataclasses import replace
from datetime import date, datetime, timedelta, timezone

import pytest

from chart.climate.data_contract import (
    ClimateDataContractError,
    MonthlyClimateRecord,
    build_climate_input_window,
    validate_monthly_record,
)
from chart.climate.input_windows import target_months

NOW = datetime(2026, 7, 21, 10, 0, tzinfo=timezone.utc)


def _record(month: date = date(2026, 7, 1)) -> MonthlyClimateRecord:
    return MonthlyClimateRecord(
        period_month=month,
        value=31.2,
        admin_unit_code="madhya-pradesh",
        admin_unit_level="state",
        boundary_version="boundary-v1",
        aggregation_method="polygon_cell_center_coslat_v1",
        source_class="observed",
        source_name="Copernicus ERA5",
        source_version="ERA5-v1",
        source_uri="https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels",
        source_license="Copernicus licence",
        source_calendar="gregorian",
        data_label="reanalysis",
        quality_status="validated",
        freshness_status="current",
        generated_at=NOW,
        valid_from=month,
        valid_to=date(month.year, month.month, 28),
        fresh_until=NOW + timedelta(days=35),
    )


def test_record_hash_is_deterministic_and_value_sensitive() -> None:
    assert _record().record_hash == _record().record_hash
    assert _record().record_hash != replace(_record(), value=31.3).record_hash


@pytest.mark.parametrize(
    ("change", "code"),
    [
        ({"unit": "K"}, "CLIMATE_UNIT_INVALID"),
        ({"source_calendar": "unknown"}, "CLIMATE_CALENDAR_UNSUPPORTED"),
        ({"boundary_version": ""}, "CLIMATE_BOUNDARY_VERSION_REQUIRED"),
        ({"value": float("nan")}, "CLIMATE_VALUE_INVALID"),
    ],
)
def test_record_rejects_invalid_provider_output(change, code: str) -> None:
    with pytest.raises(ClimateDataContractError) as error:
        validate_monthly_record(replace(_record(), **change))
    assert error.value.code == code


def test_forecast_requires_issue_and_ensemble() -> None:
    forecast = replace(
        _record(), source_class="seasonal", data_label="forecast", source_name="C3S"
    )
    with pytest.raises(ClimateDataContractError) as error:
        validate_monthly_record(forecast)
    assert error.value.code == "CLIMATE_ISSUE_TIME_REQUIRED"


def test_live_input_rejects_sample_data() -> None:
    sample = replace(_record(), data_label="sample", quality_status="sample")
    with pytest.raises(ClimateDataContractError) as error:
        validate_monthly_record(sample, live=True, now=NOW)
    assert error.value.code == "CLIMATE_SAMPLE_NOT_LIVE"


def test_exact_three_month_window_is_newest_first_and_consecutive() -> None:
    window = build_climate_input_window(
        [
            _record(date(2026, 7, 1)),
            _record(date(2026, 6, 1)),
            _record(date(2026, 5, 1)),
        ]
    )
    assert window.tmax_lag == (31.2, 31.2, 31.2)
    with pytest.raises(ClimateDataContractError) as error:
        build_climate_input_window(
            [
                _record(date(2026, 7, 1)),
                _record(date(2026, 6, 1)),
                _record(date(2026, 4, 1)),
            ]
        )
    assert error.value.code == "CLIMATE_WINDOW_GAP"


def test_planning_date_resolves_to_three_months_newest_first() -> None:
    assert target_months(date(2026, 1, 20)) == (
        date(2026, 1, 1),
        date(2025, 12, 1),
        date(2025, 11, 1),
    )
