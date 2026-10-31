"""Pull ERA5 months for every configured area of a country from one grid.

One Copernicus request per country-year replaces one request per area per
month: Copernicus charges in queue time, not bytes, and asking per area left
hundreds of requests expiring in the queue. The areas are the places of the
published model configuration (``MODEL_CACHE_DIR/outlooks/index.json``), the
same list the dashboard's pickers offer, so every place a planner can open is
pulled and no territory without a place is downloaded.

Used by the Dagster country pull (operator and automatic top-up) and by the
history backfill (``chart.climate.history``).
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

from era5_heat import (
    CELL_CENTRE,
    CELL_OVERLAP,
    DATASET,
    LAND_DATASET,
    AreaSpec,
    compute_heat_series_for_areas,
)
from era5_heat.io import write_json, write_table
from geoalchemy2.shape import to_shape
from shapely.geometry import mapping
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from chart.heat_outlook.service import published_index
from chart.shared.db.climate_load import load_era5_shared_download
from chart.shared.db.models import AdminUnit, AppGeography, Geography

from .heat_seasons import HeatwaveRule, heatwave_rule
from .service import ClimateServiceError

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_OUTDIR = REPO_ROOT / "data" / "climate"

#: Levels derived by overlap weights. Calibrated county/division models were
#: fitted on cell-centre means, so those keep the centre method.
OVERLAP_LEVELS = {"district", "constituency", "sub_county", "ward"}

#: CHART's heatwave definition where a country publishes none.
DEFAULT_HEATWAVE = HeatwaveRule(
    threshold_c=35.0,
    min_run_days=3,
    area_thresholds_c={},
    source_name="CHART default",
    source_uri="",
)


@dataclass(frozen=True)
class Product:
    """A temperature product a pull can derive, and how its rows are filed."""

    dataset: str
    #: Prefix on stored variable names; empty for the models' own input.
    variable_prefix: str
    #: Daily rows feed the under-five scorer; a context product needs none.
    with_daily: bool
    resolution: str


#: ``era5`` is what the health models read. ``era5-land`` (0.1 deg) is a
#: sharper context layer for the map, filed under ``land_*`` variables that no
#: scorer reads, because the models were not fitted on it.
PRODUCTS = {
    "era5": Product(DATASET, "", True, "ERA5 0.25 deg shared-area aggregate"),
    "era5-land": Product(
        LAND_DATASET, "land_", False, "ERA5-Land 0.1 deg shared-area aggregate"
    ),
}


@dataclass
class PullOutcome:
    climate_run_id: int
    areas_total: int
    areas_done: int
    monthly_rows: int
    daily_rows: int
    skipped: dict[str, str] = field(default_factory=dict)


def configured_areas(session: Session, country_code: str) -> list[AdminUnit]:
    """The country's places with a boundary, as the model configuration lists them.

    Without a published configuration (a fresh install before any outlook is
    installed), every registered area of the country with a boundary is used.
    """

    query = (
        select(AdminUnit)
        .join(AppGeography, AppGeography.id == AdminUnit.app_geography_id)
        .where(
            AppGeography.country_code == country_code,
            AdminUnit.boundary.is_not(None),
        )
        .order_by(AdminUnit.name)
    )
    configured = [
        geography_id
        for geography_id, item in published_index().items()
        if item.get("country_code") == country_code
    ]
    if configured:
        query = query.where(AdminUnit.app_geography_id.in_(configured))
    return list(session.scalars(query))


def country_envelope(units: list[AdminUnit]) -> tuple[float, float, float, float]:
    """The one bounding box (north, west, south, east) covering every area."""
    boxes: list[tuple[float, float, float, float]] = []
    for unit in units:
        north, west = unit.bbox_north, unit.bbox_west
        south, east = unit.bbox_south, unit.bbox_east
        if north is None or west is None or south is None or east is None:
            continue
        boxes.append((north, west, south, east))
    if not boxes:
        raise ValueError("no area in this country has a bounding box")
    return (
        max(b[0] for b in boxes),
        min(b[1] for b in boxes),
        min(b[2] for b in boxes),
        max(b[3] for b in boxes),
    )


def country_heatwave_rule(country_code: str | None) -> HeatwaveRule:
    return heatwave_rule(country_code or "") or DEFAULT_HEATWAVE


def pull_country_months(
    session_factory: sessionmaker[Session],
    country_code: str,
    months: list[date],
    *,
    log: Callable[[str], None] = print,
    product: str = "era5",
) -> PullOutcome:
    """Download one grid for ``months`` and persist every configured area's climate.

    Idempotent: repeating the same derivation writes no duplicate rows. An
    area the grid cannot cover is reported in ``skipped``, never filled.
    """

    with session_factory() as session:
        units = configured_areas(session, country_code)
        if not units:
            raise ClimateServiceError("CLIMATE_NO_AREAS", 409)
        envelope = country_envelope(units)
        heatwave = country_heatwave_rule(country_code)
        areas = [
            AreaSpec(
                id=unit.id,
                code=unit.code,
                name=unit.name,
                geometry=area_geometry(unit),
                aggregation_method=(
                    CELL_OVERLAP if unit.level in OVERLAP_LEVELS else CELL_CENTRE
                ),
                heatwave_threshold_c=heatwave.threshold_for(unit.app_geography_id),
            )
            for unit in units
        ]
        names = {unit.id: unit.app_geography_id or unit.code for unit in units}
        geography = session.get(Geography, units[0].geography_id)
        if geography is None:
            raise ValueError(f"admin unit {units[0].id} has no geography")
        preset_slug = geography.slug

    chosen = PRODUCTS[product]
    log(
        f"Pulling {country_code} {product}: grid (N,W,S,E)={tuple(round(v, 2) for v in envelope)}"
        f", {len(months)} months, {len(areas)} areas"
    )
    ensure_climate_storage_capacity()
    if not cds_credentials_available():
        raise ClimateServiceError("CLIMATE_INGEST_NOT_CONFIGURED", 503)
    results = compute_heat_series_for_areas(
        areas,
        bbox=envelope,
        target_months=tuple(months),
        threshold_c=heatwave.threshold_c,
        min_run=heatwave.min_run_days,
        dataset=chosen.dataset,
    )
    if not results:
        raise ClimateServiceError("CLIMATE_NO_GRID_CENTRES", 422)

    csv_paths: dict[int, str] = {}
    for area in areas:
        if area.id in results:
            frame, meta, _ = results[area.id]
            csv_paths[area.id] = str(
                write_observed_output(area.code, frame, meta, months)[0]
            )
    with session_factory() as session:
        run, monthly_rows, daily_rows = load_era5_shared_download(
            session,
            preset_slug=preset_slug,
            results=results,
            csv_paths=csv_paths,
            variable_prefix=chosen.variable_prefix,
            with_daily=chosen.with_daily,
            resolution=chosen.resolution,
        )
        session.commit()
        run_id = run.id
    return PullOutcome(
        climate_run_id=run_id,
        areas_total=len(areas),
        areas_done=len(results),
        monthly_rows=monthly_rows,
        daily_rows=daily_rows,
        skipped={names[a.id]: "no grid coverage" for a in areas if a.id not in results},
    )


def area_geometry(unit: AdminUnit) -> dict:
    """GeoJSON for an admin unit, whichever backend stored it."""
    boundary = unit.boundary
    if boundary is None:
        raise ValueError(f"admin unit {unit.id} has no boundary")
    if isinstance(boundary, str):
        return json.loads(boundary)
    return mapping(to_shape(boundary))


def write_observed_output(slug: str, df, meta: dict, months: list[date]):
    """Retain the derivation's source evidence beside the persisted rows."""
    outdir = Path(os.getenv("CLIMATE_OUTPUT_DIR", DEFAULT_OUTDIR))
    outdir.mkdir(parents=True, exist_ok=True)
    first, last = min(months), max(months)
    period_label = f"{first:%Y-%m}_{last:%Y-%m}"
    version = hashlib.sha256(
        json.dumps(meta, sort_keys=True, default=str).encode()
    ).hexdigest()[:16]
    table_path = outdir / f"{slug}_era5_{period_label}_{version}.csv"
    meta_path = outdir / f"{slug}_era5_{period_label}_{version}.json"
    write_table(df, table_path, "csv")
    write_json(meta, meta_path)
    return table_path, meta_path


def cds_credentials_available() -> bool:
    if os.getenv("CDSAPI_KEY"):
        return True
    credentials_file = Path(
        os.getenv("CDSAPI_RC", Path.home() / ".cdsapirc")
    ).expanduser()
    return credentials_file.is_file()


def ensure_climate_storage_capacity() -> None:
    output_dir = Path(os.getenv("CLIMATE_OUTPUT_DIR", DEFAULT_OUTDIR))
    minimum_free_bytes = max(0, int(os.getenv("CLIMATE_MIN_FREE_BYTES", str(1024**3))))
    locations = {output_dir}
    if configured_cache := os.getenv("ERA5_CACHE_DIR"):
        locations.add(Path(configured_cache).expanduser())
    for location in locations:
        location.mkdir(parents=True, exist_ok=True)
        if shutil.disk_usage(location).free < minimum_free_bytes:
            raise ClimateServiceError("CLIMATE_STORAGE_CAPACITY_LOW", 503)
