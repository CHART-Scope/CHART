"""Deterministic offline Tmax fixtures for tests and notebook fallback.

The production MVP evidence uses real ERA5 outputs with
`data_status = observed_reanalysis`. These helpers exist only so unit
tests and notebooks can run without network/CDS credentials.
"""

from __future__ import annotations

from datetime import datetime, timezone

import numpy as np
import pandas as pd

from .aggregate import build_monthly_frame
from .provenance import add_handoff_metadata

_CLIMATES: dict[str, dict] = {
    "madhya-pradesh": {
        "annual_mean_c": 31.0,
        "annual_amp_c": 8.0,
        "peak_month": 5,  # May peak (pre-monsoon).
        "day_std_c": 2.2,
        "trend_c_per_year": 0.04,
    },
    "kajiado": {
        "annual_mean_c": 26.5,
        "annual_amp_c": 3.5,
        "peak_month": 2,  # Feb peak (short rains end).
        "day_std_c": 1.6,
        "trend_c_per_year": 0.03,
    },
}


def fixture_daily_tmax(
    preset: str,
    start_year: int,
    end_year: int,
    seed: int = 0,
) -> pd.Series:
    if preset not in _CLIMATES:
        raise KeyError(f"unknown fixture preset {preset!r}")
    cfg = _CLIMATES[preset]

    idx = pd.date_range(
        f"{start_year}-01-01",
        f"{end_year}-12-31",
        freq="D",
    )
    rng = np.random.default_rng(seed)
    day_of_year = idx.dayofyear.to_numpy()

    # Peak day-of-year approximation from peak month (mid-month).
    peak_doy = int((cfg["peak_month"] - 1) * 30.4 + 15)
    seasonal = cfg["annual_mean_c"] + cfg["annual_amp_c"] * np.cos(
        2 * np.pi * (day_of_year - peak_doy) / 365.25
    )

    years_since_start = (idx.year.to_numpy() - start_year).astype("float64")
    trend = cfg["trend_c_per_year"] * years_since_start

    noise = rng.normal(0.0, cfg["day_std_c"], size=len(idx))

    tmax = seasonal + trend + noise
    return pd.Series(tmax, index=idx, name="tmax_c", dtype="float64")


def fixture_demo(
    preset: str,
    years: int = 20,
    end_year: int = 2024,
    threshold_c: float = 35.0,
    min_run: int = 3,
    seed: int = 0,
) -> tuple[pd.DataFrame, dict]:
    """Offline replacement for compute_heat_series() used by tests/notebooks."""
    from .districts import PRESETS  # local import to avoid cycle at import time

    start_year = end_year - years + 1
    daily = fixture_daily_tmax(preset, start_year, end_year, seed=seed)

    district = PRESETS[preset].name if preset in PRESETS else preset
    df = build_monthly_frame(
        daily,
        district=district,
        threshold_c=threshold_c,
        min_run=min_run,
    )
    generated_at = datetime.now(timezone.utc).isoformat()
    df = add_handoff_metadata(
        df,
        climate_source="offline_fixture",
        climate_dataset="fixture_daily_tmax",
        climate_source_version="fixture-demo-v1",
        climate_variable="tmax_c",
        data_status="sample",
        generated_at=generated_at,
        window_start_year=start_year,
        window_end_year=end_year,
        threshold_c=threshold_c,
        min_run=min_run,
    )
    meta = {
        "schema_version": 1,
        "source": "offline_fixture",
        "source_version": "fixture-demo-v1",
        "data_status": "sample",
        "preset": preset,
        "district": district,
        "window": {"start_year": start_year, "end_year": end_year, "n_years": years},
        "heatwave": {"threshold_c": threshold_c, "min_run": min_run},
        "seed": seed,
        "generated_at": generated_at,
    }
    return df, meta
