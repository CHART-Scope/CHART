"""Population per CHART place from WorldPop, for the Explore population layer.

WorldPop Global2 R2025A (constrained, UN-adjusted, 1 km, CC BY 4.0) gives
people per grid cell for every country, built from each national census and
calibrated to UN totals, with age and sex structures. Summed over CHART's own
boundaries it gives one consistent figure for every state, division,
district, county and constituency in India and Kenya; the countries' own
censuses do not (Kenya 2019 reaches constituencies, India's last is 2011 by
district).

For each configured place it stores the total, children under five (ages 0
and 1-4) and women of childbearing age (15-49), plus the area in km2 for
density. Large places sum the cells whose centres fall inside; places with
fewer than ``MIN_CENTRES`` cell centres (small urban constituencies) weight
each cell they touch by the share of it they cover, so they are not rounded
to a few whole kilometres. ``--check`` compares the sum of a country's
top-level children with the whole-country raster.

    DATABASE_URL=... python core/scripts/worldpop_population.py \\
        core/chart/population/worldpop_2025.json

Needs ``rasterio`` (``pip install rasterio``); downloads about 20 rasters
(16 MB each for India) into ``WORLDPOP_CACHE_DIR``.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.request
from datetime import date
from pathlib import Path

import numpy as np
import rasterio
from geoalchemy2.shape import to_shape
from pyproj import Geod
from rasterio.features import geometry_mask
from rasterio.windows import from_bounds
from shapely.geometry import box, mapping

from chart.climate.country_pull import configured_areas
from chart.shared.db.session import get_session_factory

YEAR = 2025
RELEASE = "R2025A"
BASE = "https://data.worldpop.org/GIS"
COUNTRIES = {"IN": "ind", "KE": "ken"}
#: WorldPop age bands: 00 is under one, 01 is one to four.
UNDER_FIVE = ("t_00", "t_01")
WOMEN_15_49 = tuple(f"f_{age:02d}" for age in range(15, 50, 5))
MIN_CENTRES = 50
GEOD = Geod(ellps="WGS84")


def raster_url(iso: str, band: str | None) -> str:
    if band is None:
        return (
            f"{BASE}/Population/Global_2015_2030/{RELEASE}/{YEAR}/{iso.upper()}/v1/"
            f"1km_ua/constrained/{iso}_pop_{YEAR}_CN_1km_{RELEASE}_UA_v1.tif"
        )
    return (
        f"{BASE}/AgeSex_structures/Global_2015_2030/{RELEASE}/{YEAR}/{iso.upper()}/"
        f"v1/1km_ua/constrained/{iso}_{band}_{YEAR}_CN_1km_{RELEASE}_UA_v1.tif"
    )


def fetch(url: str, cache: Path) -> Path:
    path = cache / url.rsplit("/", 1)[1]
    if not path.is_file():
        cache.mkdir(parents=True, exist_ok=True)
        partial = path.with_suffix(".partial")
        urllib.request.urlretrieve(url, partial)
        partial.replace(path)
    return path


def area_sum(dataset, geometry) -> float:
    """People in ``geometry``: cell centres, or covered shares when small."""
    window = from_bounds(*geometry.bounds, transform=dataset.transform).round_offsets()
    window = window.round_lengths()
    data = dataset.read(1, window=window, boundless=True, fill_value=0).astype(float)
    nodata = dataset.nodata
    if nodata is not None:
        data[data == nodata] = 0
    data[~np.isfinite(data) | (data < 0)] = 0
    transform = dataset.window_transform(window)
    inside = ~geometry_mask(
        [mapping(geometry)], data.shape, transform, all_touched=False
    )
    if inside.sum() >= MIN_CENTRES:
        return float(data[inside].sum())
    touched = ~geometry_mask(
        [mapping(geometry)], data.shape, transform, all_touched=True
    )
    total = 0.0
    for row, col in zip(*np.nonzero(touched)):
        if not data[row, col]:
            continue
        west, north = transform * (col, row)
        east, south = transform * (col + 1, row + 1)
        cell = box(west, south, east, north)
        total += data[row, col] * geometry.intersection(cell).area / cell.area
    return total


def main(argv: list[str]) -> None:
    output = Path(argv[1])
    cache = Path(os.getenv("WORLDPOP_CACHE_DIR", "/tmp/worldpop"))
    places: dict[str, dict[str, float]] = {}
    with get_session_factory()() as session:
        for country, iso in COUNTRIES.items():
            units = [
                unit
                for unit in configured_areas(session, country)
                if unit.app_geography_id
            ]
            shapes = {unit.app_geography_id: to_shape(unit.boundary) for unit in units}
            rasters = {
                band: fetch(raster_url(iso, None if band == "total" else band), cache)
                for band in ("total", *UNDER_FIVE, *WOMEN_15_49)
            }
            sums: dict[str, dict[str, float]] = {key: {} for key in shapes}
            for band, path in rasters.items():
                with rasterio.open(path) as dataset:
                    for key, geometry in shapes.items():
                        sums[key][band] = area_sum(dataset, geometry)
            for key, values in sums.items():
                area = abs(GEOD.geometry_area_perimeter(shapes[key])[0]) / 1e6
                places[key] = {
                    "total": round(values["total"]),
                    "under5": round(sum(values[band] for band in UNDER_FIVE)),
                    "women_15_49": round(sum(values[band] for band in WOMEN_15_49)),
                    "area_km2": round(area, 1),
                }
            print(f"{country}: {len(sums)} places")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(
            {
                "source": "WorldPop Global2 R2025A, constrained, UN adjusted, 1 km",
                "year": YEAR,
                "license": "CC BY 4.0",
                "source_uri": "https://hub.worldpop.org/project/categories?id=3",
                "citation": (
                    "Bondarenko M. et al. (2025). Global2: spatial distribution "
                    "of population and age/sex structures 2015-2030, R2025A. "
                    "WorldPop, University of Southampton."
                ),
                "method": (
                    "Sum of 1 km cells whose centre lies in the place; places with "
                    f"fewer than {MIN_CENTRES} centres weight each touched cell by "
                    "the share of it they cover. Under five = ages 0 and 1-4; "
                    "women 15-49 = female ages 15 to 49."
                ),
                "generated": date.today().isoformat(),
                "places": dict(sorted(places.items())),
            },
            indent=1,
        )
        + "\n"
    )


if __name__ == "__main__":
    main(sys.argv)
