from __future__ import annotations

from datetime import date, datetime, timezone
from pathlib import Path

import numpy as np
import pytest
import xarray as xr

from seasonal_c3s import (
    C3S_DATASET,
    SeasonalRequest,
    latest_available_issue_month,
    prepare_seasonal_records,
)
from seasonal_c3s.adapter import C3S_VARIABLE


class FakeClient:
    def __init__(self) -> None:
        self.dataset: str | None = None
        self.request: dict | None = None

    def retrieve(self, dataset: str, request: dict, target: str) -> None:
        self.dataset = dataset
        self.request = request
        values = np.empty((3, 2, 2, 2), dtype=float)
        values[0, :, :, :] = 303.15
        values[1, :, :, :] = 304.15
        values[2, :, :, :] = 305.15
        xr.Dataset(
            {
                C3S_VARIABLE: (
                    ("forecastMonth", "number", "latitude", "longitude"),
                    values,
                    {"units": "K"},
                )
            },
            coords={
                "forecastMonth": [1, 2, 3],
                "number": [0, 1],
                "latitude": [25.0, 24.0],
                "longitude": [77.0, 78.0],
            },
        ).to_netcdf(target)


def _request(output_path: Path) -> SeasonalRequest:
    return SeasonalRequest(
        issue_month=date(2026, 7, 1),
        target_months=(
            date(2026, 7, 1),
            date(2026, 8, 1),
            date(2026, 9, 1),
        ),
        bbox=(25.5, 76.5, 23.5, 78.5),
        geometry={
            "type": "Polygon",
            "coordinates": [
                [
                    [76.5, 23.5],
                    [78.5, 23.5],
                    [78.5, 25.5],
                    [76.5, 25.5],
                    [76.5, 23.5],
                ]
            ],
        },
        admin_unit_code="madhya-pradesh",
        admin_unit_level="state",
        boundary_version="mp-test-v1",
        output_path=output_path,
    )


def test_current_c3s_request_and_polygon_values_are_traceable(tmp_path: Path) -> None:
    client = FakeClient()

    result = prepare_seasonal_records(
        _request(tmp_path / "seasonal.nc"),
        client=client,
    )

    assert client.dataset == C3S_DATASET
    assert client.request == {
        "originating_centre": "ecmwf",
        "system": "51",
        "variable": ["maximum_2m_temperature_in_the_last_24_hours"],
        "product_type": ["monthly_mean"],
        "year": ["2026"],
        "month": ["07"],
        "leadtime_month": ["1", "2", "3"],
        "area": [25.5, 76.5, 23.5, 78.5],
        "data_format": "netcdf",
    }
    assert result.values_c == {
        date(2026, 7, 1): pytest.approx(30.0),
        date(2026, 8, 1): pytest.approx(31.0),
        date(2026, 9, 1): pytest.approx(32.0),
    }
    assert len(result.raw_object_hash) == 64
    assert result.raw_object_uri.endswith("seasonal.nc")


def test_issue_month_waits_until_the_new_release_is_available() -> None:
    assert latest_available_issue_month(
        datetime(2026, 7, 6, tzinfo=timezone.utc)
    ) == date(2026, 6, 1)
    assert latest_available_issue_month(
        datetime(2026, 7, 7, tzinfo=timezone.utc)
    ) == date(2026, 7, 1)


def test_target_outside_six_month_window_is_rejected(tmp_path: Path) -> None:
    request = _request(tmp_path / "seasonal.nc")
    request = SeasonalRequest(
        **{
            **request.__dict__,
            "target_months": (date(2027, 1, 1),),
        }
    )
    with pytest.raises(ValueError, match="C3S_TARGET_OUTSIDE_SIX_MONTH_WINDOW"):
        prepare_seasonal_records(request, client=FakeClient())
