"""The next six months for every place, from the C3S multi-system forecast.

Copernicus publishes, on the 10th of each month, six-month forecasts from nine
centres (ECMWF, Météo-France, DWD, CMCC, NCEP, UK Met Office, JMA, ECCC, BOM).
Each system's raw temperatures carry its own bias, so CHART uses the
**anomalies** C3S publishes (each system's departure from its own 1993-2016
hindcast normal, ``seasonal-postprocessed-single-levels``) and adds them to
the place's own ERA5 normal for that calendar month (2006-2016, the years the
store and the hindcast share). The result sits on the scale the health models
already read, for every configured place:

    forecast Tmax(place, month) = ERA5 normal(place, month) + anomaly(place, month)

The multi-system mean is the central value; the coolest and warmest systems
give the range. Each place's next six months are then scored with the same
models as its observed months: Kenya's calibrated national curves (counties
and constituencies), India's live models (districts with their division's).
Results are saved per issue under ``MODEL_CACHE_DIR/forecasts`` and served
read-only; a daily Dagster check rebuilds when a new issue appears.

    python -m chart.climate.seasonal_forecast build --country KE
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from statistics import mean

import numpy as np
import xarray as xr
from geoalchemy2.shape import to_shape
from shapely.geometry import box
from shapely.geometry.base import BaseGeometry
from sqlalchemy import select
from sqlalchemy.orm import Session

from chart.shared.db.models import ClimateRun, DataLabel, DistrictClimate
from chart.shared.db.session import get_session_factory

from .country_pull import configured_areas

logger = logging.getLogger(__name__)

DATASET = "seasonal-postprocessed-single-levels"
VARIABLE = "maximum_2m_temperature_in_the_last_24_hours_anomaly"
CENTRES = (
    "ecmwf",
    "meteo_france",
    "dwd",
    "cmcc",
    "ncep",
    "ukmo",
    "jma",
    "eccc",
    "bom",
)
CONSTRAINTS_URL = (
    "https://cds.climate.copernicus.eu/api/retrieve/v1/processes/"
    f"{DATASET}/constraints"
)
#: Years the ERA5 normal is taken over: the store's overlap with 1993-2016.
NORMAL_YEARS = range(2006, 2017)
LEADS = range(1, 7)


@dataclass(frozen=True)
class System:
    centre: str
    system: str

    @property
    def label(self) -> str:
        return f"{self.centre} {self.system}"


def forecast_dir() -> Path:
    root = os.getenv("MODEL_CACHE_DIR")
    base = Path(root) if root else Path("outputs")
    return base / "forecasts"


def latest_issue(today: date | None = None) -> date:
    """C3S publishes on the 10th; allow a day for every centre to arrive."""
    today = today or datetime.now(timezone.utc).date()
    first = today.replace(day=1)
    if today.day >= 11:
        return first
    return date(first.year - (first.month == 1), (first.month - 2) % 12 + 1, 1)


def available_systems(issue: date) -> list[System]:
    """Each centre's systems published for ``issue`` (asks CDS, no download)."""
    systems: list[System] = []
    for centre in CENTRES:
        body = json.dumps(
            {
                "inputs": {
                    "originating_centre": [centre],
                    "year": [f"{issue.year}"],
                    "month": [f"{issue.month:02d}"],
                    "variable": [VARIABLE],
                    "product_type": ["ensemble_mean"],
                }
            }
        ).encode()
        request = urllib.request.Request(
            CONSTRAINTS_URL, data=body, headers={"content-type": "application/json"}
        )
        found: list[str] = []
        for _attempt in range(3):
            try:
                with urllib.request.urlopen(request, timeout=60) as response:
                    found = json.loads(response.read()).get("system") or []
                break
            except OSError:
                logger.warning("C3S constraints for %s unavailable; retrying", centre)
        # The newest system when a centre runs two (ECCC).
        if found:
            systems.append(System(centre, max(found, key=int)))
    return systems


def target_months(issue: date) -> list[date]:
    months = []
    for lead in LEADS:
        index = issue.year * 12 + issue.month - 1 + lead - 1
        months.append(date(index // 12, index % 12 + 1, 1))
    return months


def download(system: System, issue: date, bbox, cache: Path) -> Path:
    """One system's ensemble-mean Tmax anomalies for the six leads."""
    north, west, south, east = bbox
    path = cache / (
        f"c3s-anomaly-{system.centre}-{system.system}-{issue:%Y-%m}-"
        f"{north:.0f}_{west:.0f}_{south:.0f}_{east:.0f}.nc"
    )
    if path.is_file() and path.stat().st_size:
        return path
    from era5_heat.cds_client import _make_client

    cache.mkdir(parents=True, exist_ok=True)
    partial = path.with_suffix(".partial")
    _make_client().retrieve(
        DATASET,
        {
            "originating_centre": system.centre,
            "system": system.system,
            "variable": [VARIABLE],
            "product_type": ["ensemble_mean"],
            "year": [f"{issue.year}"],
            "month": [f"{issue.month:02d}"],
            "leadtime_month": [str(lead) for lead in LEADS],
            "area": [north, west, south, east],
            "data_format": "netcdf",
        },
        str(partial),
    )
    partial.replace(path)
    return path


def area_anomalies(
    path: Path, shapes: dict[str, object]
) -> dict[str, dict[int, float]]:
    """Each place's anomaly per lead: cells weighted by the area they share."""
    with xr.open_dataset(path) as dataset:
        name = next(iter(dataset.data_vars))
        data = dataset[name]
        lat = "latitude" if "latitude" in data.dims else "lat"
        lon = "longitude" if "longitude" in data.dims else "lon"
        lead = next(
            d
            for d in ("forecastMonth", "forecast_month", "leadtime_month")
            if d in data.dims
        )
        others = [d for d in data.dims if d not in (lat, lon, lead)]
        if others:
            data = data.mean(dim=others, skipna=True)
        values = data.transpose(lead, lat, lon).values
        lats = data[lat].values
        lons = data[lon].values
        leads = [int(value) for value in data[lead].values]
    step_lat = abs(float(lats[1] - lats[0])) if len(lats) > 1 else 1.0
    step_lon = abs(float(lons[1] - lons[0])) if len(lons) > 1 else 1.0
    out: dict[str, dict[int, float]] = {}
    for key, geometry in shapes.items():
        weights: list[tuple[int, int, float]] = []
        for i, la in enumerate(lats):
            for j, lo in enumerate(lons):
                cell = box(
                    lo - step_lon / 2,
                    la - step_lat / 2,
                    lo + step_lon / 2,
                    la + step_lat / 2,
                )
                if not cell.intersects(geometry):
                    continue
                share = cell.intersection(geometry).area
                if share > 0:
                    weights.append((i, j, share * float(np.cos(np.deg2rad(la)))))
        if not weights:
            continue
        per_lead: dict[int, float] = {}
        for index, value in enumerate(leads):
            cells = [
                (values[index, i, j], w)
                for i, j, w in weights
                if np.isfinite(values[index, i, j])
            ]
            if cells:
                total = sum(w for _, w in cells)
                per_lead[value] = float(sum(v * w for v, w in cells) / total)
        out[key] = per_lead
    return out


def era5_normals(session: Session, unit_ids: list[int]) -> dict[int, dict[int, float]]:
    """Each place's 2006-2016 mean of monthly mean Tmax, per calendar month."""
    newest: dict[tuple[int, date], tuple[int, float]] = {}
    for unit_id, month, value, run in session.execute(
        select(
            DistrictClimate.admin_unit_id,
            DistrictClimate.period_month,
            DistrictClimate.value,
            ClimateRun.id,
        )
        .join(ClimateRun, ClimateRun.id == DistrictClimate.climate_run_id)
        .where(
            DistrictClimate.admin_unit_id.in_(unit_ids),
            DistrictClimate.variable == "tmax_monthly_mean_c",
            ClimateRun.data_label.in_((DataLabel.observed, DataLabel.reanalysis)),
            DistrictClimate.period_month.between(
                date(NORMAL_YEARS[0], 1, 1), date(NORMAL_YEARS[-1], 12, 1)
            ),
        )
    ):
        key = (unit_id, month)
        if key not in newest or run > newest[key][0]:
            newest[key] = (run, float(value))
    by_month: dict[int, dict[int, list[float]]] = defaultdict(lambda: defaultdict(list))
    for (unit_id, month), (_, value) in newest.items():
        by_month[unit_id][month.month].append(value)
    return {
        unit_id: {month: mean(values) for month, values in months.items()}
        for unit_id, months in by_month.items()
    }


def build(country: str, issue: date | None = None, *, log=print) -> Path:
    issue = issue or latest_issue()
    systems = available_systems(issue)
    if not systems:
        raise RuntimeError(f"no C3S systems published for {issue:%Y-%m}")
    months = target_months(issue)
    factory = get_session_factory()
    with factory() as session:
        units = [
            unit
            for unit in configured_areas(session, country)
            if unit.app_geography_id and unit.boundary is not None
        ]
        shapes: dict[str, BaseGeometry] = {
            str(unit.app_geography_id): to_shape(unit.boundary)  # type: ignore[arg-type]
            for unit in units
        }
        normals = era5_normals(session, [unit.id for unit in units])
    bounds = np.array([shape.bounds for shape in shapes.values()])
    bbox = (
        float(np.ceil(bounds[:, 3].max()) + 1),
        float(np.floor(bounds[:, 0].min()) - 1),
        float(np.floor(bounds[:, 1].min()) - 1),
        float(np.ceil(bounds[:, 2].max()) + 1),
    )
    cache = Path(os.getenv("ERA5_CACHE_DIR", "/tmp")) / "c3s-seasonal"
    anomalies: dict[str, dict[str, dict[int, float]]] = {}

    def fetch(system: System) -> tuple[System, Path]:
        return system, download(system, issue, bbox, cache)

    # All systems are requested together: each waits in the Copernicus queue
    # on its own, so one at a time would take hours.
    with ThreadPoolExecutor(max_workers=len(systems)) as pool:
        futures = [pool.submit(fetch, system) for system in systems]
        for future in as_completed(futures):
            try:
                system, path = future.result()
            except (
                Exception
            ) as error:  # noqa: BLE001 - one centre must not stop the rest
                log(f"{country} {issue:%Y-%m}: a system was skipped ({error})")
                continue
            anomalies[system.label] = area_anomalies(path, shapes)
            log(f"{country} {issue:%Y-%m}: {system.label} downloaded")
    if not anomalies:
        raise RuntimeError("no C3S system could be downloaded")

    places: dict[str, dict] = {}
    by_id = {str(unit.app_geography_id): unit for unit in units}
    for key, unit in by_id.items():
        normal = normals.get(unit.id)
        if not normal or len(normal) < 12:
            continue
        temps: dict[str, list[float]] = {}
        for lead, month in zip(LEADS, months):
            values = [
                system_values[key][lead]
                for system_values in anomalies.values()
                if key in system_values and lead in system_values[key]
            ]
            if not values:
                continue
            base = normal[month.month]
            temps[month.strftime("%Y-%m")] = [
                round(base + mean(values), 2),
                round(base + min(values), 2),
                round(base + max(values), 2),
            ]
        if temps:
            places[key] = {
                "tmax_c": temps,
                "normal_c": {m: round(v, 2) for m, v in normal.items()},
            }
    log(f"{country} {issue:%Y-%m}: {len(places)} places with a forecast")

    from .seasonal_scoring import score_places

    score_places(factory, country, by_id, places, months, log=log)
    document = {
        "country": country,
        "issue": issue.strftime("%Y-%m"),
        "months": [month.strftime("%Y-%m") for month in months],
        "systems": sorted(anomalies),
        "source": "Copernicus C3S multi-system seasonal forecast, Tmax anomalies",
        "source_uri": f"https://cds.climate.copernicus.eu/datasets/{DATASET}",
        "method": (
            "Each place's 2006-2016 ERA5 normal for the calendar month plus the "
            "area-weighted anomaly; central value is the mean of systems, range "
            "the coolest and warmest system."
        ),
        "generated": datetime.now(timezone.utc).isoformat(),
        "places": places,
    }
    out = forecast_dir() / f"{country}-{issue:%Y-%m}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    partial = out.with_suffix(".partial")
    partial.write_text(json.dumps(document))
    partial.replace(out)
    log(f"{country} {issue:%Y-%m}: saved {out}")
    return out


def latest_document(country: str) -> dict | None:
    """The newest saved forecast for a country, or None."""
    files = sorted(forecast_dir().glob(f"{country}-*.json"))
    if not files:
        return None
    return _read(files[-1], files[-1].stat().st_mtime_ns)


_read_cache: dict[tuple[Path, int], dict] = {}


def _read(path: Path, mtime: int) -> dict:
    key = (path, mtime)
    if key not in _read_cache:
        _read_cache.clear()
        _read_cache[key] = json.loads(path.read_text())
    return _read_cache[key]


def needs_build(country: str, issue: date | None = None) -> bool:
    issue = issue or latest_issue()
    return not (forecast_dir() / f"{country}-{issue:%Y-%m}.json").is_file()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["build", "check"])
    parser.add_argument("--country", required=True, choices=["IN", "KE"])
    parser.add_argument("--issue", help="YYYY-MM; default the newest published")
    args = parser.parse_args(argv)
    issue = date.fromisoformat(f"{args.issue}-01") if args.issue else latest_issue()
    if args.command == "check":
        print(
            json.dumps(
                {
                    "issue": issue.isoformat(),
                    "needs_build": needs_build(args.country, issue),
                }
            )
        )
        return 0
    build(args.country, issue)
    return 0


if __name__ == "__main__":
    sys.exit(main())
