"""ERA5 monthly Tmax + heatwave-day pipeline."""

from __future__ import annotations

import logging
import os
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path

import pandas as pd
import xarray as xr

from .aggregate import build_monthly_frame, to_daily_tmax_c
from .cds_client import DATASET, VARIABLE, BBox, download_years, validate_bbox
from .districts import PRESETS, District
from .fixtures import fixture_demo
from .provenance import add_handoff_metadata

__all__ = [
    "AreaSpec",
    "compute_heat_series",
    "compute_heat_series_for_areas",
    "fixture_demo",
    "PRESETS",
    "District",
    "BBox",
    "DATASET",
    "VARIABLE",
]

log = logging.getLogger(__name__)


def _default_end_year() -> int:
    return datetime.now(timezone.utc).year - 1


def compute_heat_series(
    district: str,
    bbox: BBox,
    years: int = 20,
    end_year: int | None = None,
    threshold_c: float = 35.0,
    min_run: int = 3,
    cache_dir: Path | None = None,
    *,
    no_cache: bool = False,
    refresh: bool = False,
    max_workers: int | None = None,
    geometry: dict | None = None,
    grid_transform: Callable[[xr.Dataset], xr.Dataset] | None = None,
    target_months: tuple[date, ...] | None = None,
) -> tuple[pd.DataFrame, dict, pd.Series]:
    """Compute the monthly Tmax + heatwave-day series for a district.

    Returns (monthly_df, run_metadata). The DataFrame has one row per
    month over the chosen window, sorted ascending.
    """
    validate_bbox(bbox)
    if years < 1:
        raise ValueError("years must be >= 1")

    requested_months: tuple[date, ...] | None = None
    months_by_year: dict[int, tuple[int, ...]] | None = None
    if target_months is not None:
        requested_months = tuple(
            sorted({month.replace(day=1) for month in target_months})
        )
        if not requested_months:
            raise ValueError("target_months must not be empty")
        start_year = requested_months[0].year
        end_year = requested_months[-1].year
        year_list = sorted({month.year for month in requested_months})
        months_by_year = {
            year: tuple(month.month for month in requested_months if month.year == year)
            for year in year_list
        }
    else:
        end_year = end_year or _default_end_year()
        start_year = end_year - years + 1
        year_list = list(range(start_year, end_year + 1))

    t_start = time.monotonic()
    worker_count = (
        max_workers
        if max_workers is not None
        else int(os.getenv("ERA5_DOWNLOAD_WORKERS", "2"))
    )
    if not 1 <= worker_count <= 8:
        raise ValueError("max_workers must be between 1 and 8")
    downloads = download_years(
        year_list,
        bbox,
        cache_dir=cache_dir,
        months_by_year=months_by_year,
        no_cache=no_cache,
        refresh=refresh,
        max_workers=worker_count,
    )

    daily_parts = []
    for d in downloads:
        with xr.open_dataset(d.path) as ds:
            # Optional Expert Analytics downscaling belongs here. Keep it off until
            # McQueens confirms the method, and always retain the original source file.
            prepared = grid_transform(ds) if grid_transform is not None else ds
            daily_parts.append(to_daily_tmax_c(prepared, geometry=geometry))
    daily = pd.concat(daily_parts).sort_index()
    daily = daily[~daily.index.duplicated(keep="first")]

    generated_at = datetime.now(timezone.utc).isoformat()
    df = build_monthly_frame(
        daily,
        district=district,
        threshold_c=threshold_c,
        min_run=min_run,
    )
    if requested_months is not None:
        requested_set = set(requested_months)
        df = df[df["month"].isin(requested_set)].reset_index(drop=True)
    df = add_handoff_metadata(
        df,
        climate_source="Copernicus Climate Data Store",
        climate_dataset=DATASET,
        climate_source_version="ERA5 hourly data on single levels",
        climate_variable=VARIABLE,
        data_status="observed_reanalysis",
        generated_at=generated_at,
        window_start_year=start_year,
        window_end_year=end_year,
        threshold_c=threshold_c,
        min_run=min_run,
    )

    meta = {
        "schema_version": 1,
        "source": "Copernicus Climate Data Store",
        "source_version": "ERA5 hourly data on single levels",
        "data_status": "observed_reanalysis",
        "district": district,
        "bbox": list(bbox),
        "bbox_order": "north,west,south,east",
        "aggregation_method": (
            "polygon_cell_center_coslat_v1" if geometry else "bbox_coslat_mean_v1"
        ),
        "downscaling_method": (
            "expert_analytics_pending" if grid_transform is not None else "none"
        ),
        "dataset": DATASET,
        "variable": VARIABLE,
        "window": {
            "start_year": start_year,
            "end_year": end_year,
            "n_years": end_year - start_year + 1,
        },
        "heatwave": {"threshold_c": threshold_c, "min_run": min_run},
        "cache": [
            {
                "year": d.year,
                "months": list(d.months),
                "cache_hit": d.cache_hit,
                "path": str(d.path),
            }
            for d in downloads
        ],
        "row_count": int(len(df)),
        "runtime_s": round(time.monotonic() - t_start, 2),
        "generated_at": generated_at,
    }
    if requested_months is not None:
        meta["requested_months"] = [month.isoformat() for month in requested_months]
        # Keep only the days inside the requested months so the daily handoff
        # covers exactly the same period as the monthly frame.
        wanted = {(m.year, m.month) for m in requested_months}
        daily = daily[[(ts.year, ts.month) in wanted for ts in daily.index]]
    # The daily series is returned alongside the monthly frame because the
    # under-five models are fitted on daily maxima with daily lags. It used to
    # be discarded after aggregation, which left CHART unable to answer what
    # those models were fitted to ask.
    return df, meta, daily


@dataclass(frozen=True)
class AreaSpec:
    """One administrative area to derive from a shared download."""

    id: int
    code: str
    name: str
    geometry: dict


def compute_heat_series_for_areas(
    areas: Sequence[AreaSpec],
    bbox: BBox,
    *,
    target_months: tuple[date, ...],
    threshold_c: float = 35.0,
    min_run: int = 3,
    cache_dir: Path | None = None,
    no_cache: bool = False,
    refresh: bool = False,
    max_workers: int | None = None,
    grid_transform: Callable[[xr.Dataset], xr.Dataset] | None = None,
) -> dict[int, tuple[pd.DataFrame, dict, pd.Series]]:
    """Download one grid covering ``bbox``, then derive every area from it.

    The sibling of :func:`compute_heat_series`, and the reason it can exist is
    that the aggregation was never tied to the download's extent:
    ``to_daily_tmax_c`` masks whatever grid it is handed to the cell centres
    inside a polygon, so one country-sized grid serves every area in it.

    Why this matters: Copernicus charges in queue time, not bytes. A month of
    one county is ~600 kB but waits a median 215s in the queue, so asking per
    area per month meant hundreds of waits for a country - and enough of them
    that requests expired before a worker reached them. One request per
    country-year replaces roughly 635 of them for the coverage we hold today.

    Returns one entry per area whose geometry actually intersects the grid.
    An area that does not is omitted rather than returned empty, so the caller
    can report it instead of writing a row of nothing.
    """

    if not areas:
        raise ValueError("areas must not be empty")
    requested_months = tuple(sorted({month.replace(day=1) for month in target_months}))
    if not requested_months:
        raise ValueError("target_months must not be empty")
    validate_bbox(bbox)

    year_list = sorted({month.year for month in requested_months})
    months_by_year = {
        year: tuple(month.month for month in requested_months if month.year == year)
        for year in year_list
    }
    worker_count = (
        max_workers
        if max_workers is not None
        else int(os.getenv("ERA5_DOWNLOAD_WORKERS", "2"))
    )
    if not 1 <= worker_count <= 8:
        raise ValueError("max_workers must be between 1 and 8")

    t_start = time.monotonic()
    downloads = download_years(
        year_list,
        bbox,
        cache_dir=cache_dir,
        months_by_year=months_by_year,
        no_cache=no_cache,
        refresh=refresh,
        max_workers=worker_count,
    )
    generated_at = datetime.now(timezone.utc).isoformat()
    requested_set = set(requested_months)

    # Daily series per area, built by reading each downloaded year once and
    # masking it to every area in turn. Opening the file once per year rather
    # than once per (year, area) is the difference between one pass over the
    # data and forty-seven.
    daily_parts: dict[int, list[pd.Series]] = {area.id: [] for area in areas}
    skipped: dict[int, str] = {}
    for item in downloads:
        with xr.open_dataset(item.path) as ds:
            prepared = grid_transform(ds) if grid_transform is not None else ds
            for area in areas:
                if area.id in skipped:
                    continue
                try:
                    daily_parts[area.id].append(
                        to_daily_tmax_c(prepared, geometry=area.geometry)
                    )
                except ValueError as error:
                    # An area smaller than a grid cell can contain no cell
                    # centre. That is a real limitation of the data, not a
                    # failure of the download, so record it and carry on with
                    # the rest rather than losing the whole country.
                    skipped[area.id] = str(error)

    results: dict[int, tuple[pd.DataFrame, dict, pd.Series]] = {}
    runtime_s = round(time.monotonic() - t_start, 2)
    for area in areas:
        if area.id in skipped or not daily_parts[area.id]:
            log.warning(
                "era5: %s produced no grid centres (%s)",
                area.code,
                skipped.get(area.id, "no data"),
            )
            continue
        daily = pd.concat(daily_parts[area.id]).sort_index()
        daily = daily[~daily.index.duplicated(keep="first")]
        frame = build_monthly_frame(
            daily, district=area.name, threshold_c=threshold_c, min_run=min_run
        )
        frame = frame[frame["month"].isin(requested_set)].reset_index(drop=True)
        frame = add_handoff_metadata(
            frame,
            climate_source="Copernicus Climate Data Store",
            climate_dataset=DATASET,
            climate_source_version="ERA5 hourly data on single levels",
            climate_variable=VARIABLE,
            data_status="observed_reanalysis",
            generated_at=generated_at,
            window_start_year=year_list[0],
            window_end_year=year_list[-1],
            threshold_c=threshold_c,
            min_run=min_run,
        )
        daily = daily[
            [
                (ts.year, ts.month) in {(m.year, m.month) for m in requested_months}
                for ts in daily.index
            ]
        ]
        # Each area keeps its own name and its own bbox in `meta`, because the
        # loader hashes `meta` into the run's input_hash - a shared one would
        # file every area under a description of the wrong place.
        results[area.id] = (
            frame,
            {
                "schema_version": 1,
                "source": "Copernicus Climate Data Store",
                "source_version": "ERA5 hourly data on single levels",
                "data_status": "observed_reanalysis",
                "district": area.name,
                "bbox": list(bbox),
                "bbox_order": "north,west,south,east",
                "aggregation_method": "polygon_cell_center_coslat_v1",
                "downscaling_method": (
                    "expert_analytics_pending" if grid_transform is not None else "none"
                ),
                "dataset": DATASET,
                "variable": VARIABLE,
                "window": {
                    "start_year": year_list[0],
                    "end_year": year_list[-1],
                    "n_years": year_list[-1] - year_list[0] + 1,
                },
                "heatwave": {"threshold_c": threshold_c, "min_run": min_run},
                "shared_download": True,
                "cache": [
                    {
                        "year": item.year,
                        "months": list(item.months),
                        "cache_hit": item.cache_hit,
                        "path": str(item.path),
                    }
                    for item in downloads
                ],
                "row_count": int(len(frame)),
                "runtime_s": runtime_s,
                "generated_at": generated_at,
                "requested_months": [m.isoformat() for m in requested_months],
            },
            daily,
        )
    return results
