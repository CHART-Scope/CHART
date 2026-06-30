"""ERA5 monthly Tmax + heatwave-day pipeline."""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import xarray as xr

from .aggregate import build_monthly_frame, to_daily_tmax_c
from .cds_client import DATASET, VARIABLE, BBox, download_years, validate_bbox
from .districts import PRESETS, District
from .fixtures import fixture_demo
from .provenance import add_handoff_metadata

__all__ = [
    "compute_heat_series",
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
    max_workers: int = 3,
) -> tuple[pd.DataFrame, dict]:
    """Compute the monthly Tmax + heatwave-day series for a district.

    Returns (monthly_df, run_metadata). The DataFrame has one row per
    month over the chosen window, sorted ascending.
    """
    validate_bbox(bbox)
    if years < 1:
        raise ValueError("years must be >= 1")

    end_year = end_year or _default_end_year()
    start_year = end_year - years + 1
    year_list = list(range(start_year, end_year + 1))

    t_start = time.monotonic()
    downloads = download_years(
        year_list, bbox, cache_dir=cache_dir,
        no_cache=no_cache, refresh=refresh, max_workers=max_workers,
    )

    daily_parts = []
    for d in downloads:
        with xr.open_dataset(d.path) as ds:
            daily_parts.append(to_daily_tmax_c(ds))
    daily = pd.concat(daily_parts).sort_index()
    daily = daily[~daily.index.duplicated(keep="first")]

    generated_at = datetime.now(timezone.utc).isoformat()
    df = build_monthly_frame(
        daily, district=district, threshold_c=threshold_c, min_run=min_run,
    )
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
        "dataset": DATASET,
        "variable": VARIABLE,
        "window": {
            "start_year": start_year,
            "end_year": end_year,
            "n_years": years,
        },
        "heatwave": {"threshold_c": threshold_c, "min_run": min_run},
        "cache": [
            {"year": d.year, "cache_hit": d.cache_hit, "path": str(d.path)}
            for d in downloads
        ],
        "row_count": int(len(df)),
        "runtime_s": round(time.monotonic() - t_start, 2),
        "generated_at": generated_at,
    }
    return df, meta
