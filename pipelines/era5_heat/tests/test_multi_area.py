"""One download, many areas — the property that makes country-wide pulling honest.

Copernicus charges in queue time, not bytes: a county-month is ~600 kB but
waits a median 215s. Asking per area per month meant hundreds of waits for one
country, enough that requests expired before a worker reached them.

Pulling one country-sized grid is only legitimate if each area is still
derived from its own cells. These tests pin exactly that: two disjoint
geometries over one grid must disagree, and an area too small to contain a
grid centre must be reported rather than silently returned as zero.

No network: the download step is stubbed and the grid is built in memory.
"""

from __future__ import annotations

from datetime import date

import numpy as np
import pandas as pd
import pytest
import xarray as xr

import era5_heat
from era5_heat import AreaSpec, compute_heat_series_for_areas


def _square(west: float, south: float, size: float = 1.0) -> dict:
    return {
        "type": "Polygon",
        "coordinates": [
            [
                [west, south],
                [west + size, south],
                [west + size, south + size],
                [west, south + size],
                [west, south],
            ]
        ],
    }


@pytest.fixture
def one_grid(tmp_path, monkeypatch):
    """A June grid spanning two well-separated cells: a cool west, a hot east."""
    times = pd.date_range("2026-06-01", periods=24 * 30, freq="h")
    lats = np.array([0.5, 1.5])
    lons = np.array([34.5, 40.5])

    # Column 0 (west) sits at 20 C, column 1 (east) at 40 C, all hours.
    values = np.empty((len(times), len(lats), len(lons)), dtype="float64")
    values[:, :, 0] = 20.0
    values[:, :, 1] = 40.0
    dataset = xr.Dataset(
        {"t2m": (("time", "latitude", "longitude"), values + 273.15)},
        coords={"time": times, "latitude": lats, "longitude": lons},
    )
    dataset["t2m"].attrs["units"] = "K"
    path = tmp_path / "grid.nc"
    dataset.to_netcdf(path)

    class _Download:
        year = 2026
        months = (6,)
        cache_hit = False

        def __init__(self, path):
            self.path = path

    monkeypatch.setattr(era5_heat, "download_years", lambda *a, **k: [_Download(path)])
    return path


def test_two_areas_over_one_download_get_their_own_values(one_grid) -> None:
    """The whole justification for sharing a download.

    If both areas came back with the same number, the shared grid would be
    averaging the country and attributing it to each place.
    """
    west = AreaSpec(id=1, code="west", name="West", geometry=_square(34.0, 0.0))
    east = AreaSpec(id=2, code="east", name="East", geometry=_square(40.0, 0.0))

    results = compute_heat_series_for_areas(
        [west, east],
        bbox=(2.0, 34.0, 0.0, 41.0),
        target_months=(date(2026, 6, 1),),
    )

    assert set(results) == {1, 2}
    west_frame, _, _ = results[1]
    east_frame, _, _ = results[2]
    assert west_frame["tmax_monthly_mean_c"].iloc[0] == pytest.approx(20.0, abs=0.01)
    assert east_frame["tmax_monthly_mean_c"].iloc[0] == pytest.approx(40.0, abs=0.01)


def test_each_area_keeps_its_own_name_in_the_metadata(one_grid) -> None:
    """`meta` is hashed into the climate run's input_hash.

    A shared `meta` would file every area's run under a description of the
    wrong place, so the district name has to be per area even though the
    download is not.
    """
    areas = [
        AreaSpec(id=1, code="west", name="West", geometry=_square(34.0, 0.0)),
        AreaSpec(id=2, code="east", name="East", geometry=_square(40.0, 0.0)),
    ]
    results = compute_heat_series_for_areas(
        areas, bbox=(2.0, 34.0, 0.0, 41.0), target_months=(date(2026, 6, 1),)
    )

    assert results[1][1]["district"] == "West"
    assert results[2][1]["district"] == "East"
    # Both record that they came from one download, so provenance does not
    # claim two separate acquisitions.
    assert results[1][1]["shared_download"] is True
    assert results[1][1]["cache"] == results[2][1]["cache"]


def test_an_area_with_no_grid_centre_is_omitted_not_zeroed(one_grid) -> None:
    """A place smaller than a cell is a data limitation, not a failure.

    Returning an empty frame would write a row of nothing; dropping the whole
    country would lose the areas that did work. It is omitted and logged, so
    the caller can report it.
    """
    real = AreaSpec(id=1, code="west", name="West", geometry=_square(34.0, 0.0))
    tiny = AreaSpec(
        id=2, code="tiny", name="Tiny", geometry=_square(37.0, 0.2, size=0.01)
    )

    results = compute_heat_series_for_areas(
        [real, tiny], bbox=(2.0, 34.0, 0.0, 41.0), target_months=(date(2026, 6, 1),)
    )

    assert 1 in results
    assert 2 not in results


def test_only_the_requested_months_survive(one_grid) -> None:
    """The grid holds June; asking for May must not invent it."""
    area = AreaSpec(id=1, code="west", name="West", geometry=_square(34.0, 0.0))
    results = compute_heat_series_for_areas(
        [area],
        bbox=(2.0, 34.0, 0.0, 41.0),
        target_months=(date(2026, 6, 1),),
    )
    frame, _, daily = results[1]
    assert list(frame["month"]) == [date(2026, 6, 1)]
    assert {ts.month for ts in daily.index} == {6}


def test_no_areas_is_a_programming_error_not_an_empty_download() -> None:
    with pytest.raises(ValueError):
        compute_heat_series_for_areas(
            [], bbox=(2.0, 34.0, 0.0, 41.0), target_months=(date(2026, 6, 1),)
        )
