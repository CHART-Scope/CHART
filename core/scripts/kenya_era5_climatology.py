"""ERA5's 2011-2020 monthly mean Tmax per Kenyan county, for the observed calibration.

The observed view (``chart.heat_outlook.observed``) shifts ERA5 onto the scale
the Kenya models were fitted on, by the difference between the model-scale and
the ERA5 mean of each county and calendar month over 2011-2020. This script
produces the ERA5 side with the climate pipeline's own download and county
averaging, so it matches the months the dashboard scores::

    DATABASE_URL=... python core/scripts/kenya_era5_climatology.py out.csv
    chart-publish-kenya --lbw-dir ... --u5-dir ... --era5-climatology out.csv

It needs Copernicus credentials (``~/.cdsapirc``) and downloads one hourly
grid per year (about 23 MB, 10-15 minutes in the queue each).
"""

from __future__ import annotations

import csv
import sys
from datetime import date
from pathlib import Path

from era5_heat import AreaSpec, compute_heat_series_for_areas
from geoalchemy2.shape import to_shape
from shapely.geometry import mapping

from chart.climate.country_pull import configured_areas, country_envelope
from chart.shared.db.session import get_session_factory

YEARS = range(2011, 2021)


def main(argv: list[str]) -> None:
    output = Path(argv[1])
    with get_session_factory()() as session:
        units = [
            unit for unit in configured_areas(session, "KE") if unit.level == "county"
        ]
        envelope = country_envelope(units)
        areas = [
            AreaSpec(
                id=unit.id,
                code=unit.code,
                name=unit.name,
                geometry=mapping(to_shape(unit.boundary)),
            )
            for unit in units
        ]
        geography = {unit.id: unit.app_geography_id for unit in units}
    months = tuple(date(year, month, 1) for year in YEARS for month in range(1, 13))
    results = compute_heat_series_for_areas(areas, bbox=envelope, target_months=months)
    with output.open("w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["geography_id", "year", "month", "tmax_mean_c", "days"])
        for area_id, (_, _, daily) in sorted(results.items()):
            grouped = daily.groupby([daily.index.year, daily.index.month])
            for (year, month), values in grouped:
                writer.writerow(
                    [
                        geography[area_id],
                        year,
                        month,
                        round(values.mean(), 4),
                        len(values),
                    ]
                )
    print(f"wrote {output} for {len(results)} counties")


if __name__ == "__main__":
    main(sys.argv)
