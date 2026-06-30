"""Daily Tmax, monthly aggregation, and heatwave-day counting."""

from __future__ import annotations

import numpy as np
import pandas as pd
import xarray as xr


def to_daily_tmax_c(ds: xr.Dataset) -> pd.Series:
    """Hourly t2m (K) over a bbox -> district-level daily Tmax (C).

    Resamples each grid cell to daily max, then takes a cos(lat)
    area-weighted mean across the bbox to produce a single 1D series.
    """
    var = "t2m" if "t2m" in ds else _first_temperature_var(ds)
    t2m_c = ds[var] - 273.15

    lat_dim = _find_dim(t2m_c, ("latitude", "lat", "y"))
    lon_dim = _find_dim(t2m_c, ("longitude", "lon", "x"))
    time_dim = _find_dim(t2m_c, ("time", "valid_time"))

    daily_max_grid = t2m_c.resample({time_dim: "1D"}).max()

    weights = np.cos(np.deg2rad(daily_max_grid[lat_dim]))
    weights.name = "weights"
    district_daily = (
        daily_max_grid.weighted(weights).mean((lat_dim, lon_dim))
    )

    series = district_daily.to_pandas()
    series.index = pd.to_datetime(series.index)
    series.name = "tmax_c"
    return series.astype("float64")


def monthly_aggregate(daily: pd.Series) -> pd.DataFrame:
    """Daily Tmax series -> monthly DataFrame with both Tmax stats.

    `tmax_monthly_max_c` is the peak day. `tmax_monthly_mean_c` is the
    mean of daily Tmax (the WMO convention for "monthly Tmax").
    """
    if daily.empty:
        return pd.DataFrame(
            columns=["tmax_monthly_max_c", "tmax_monthly_mean_c"],
            index=pd.DatetimeIndex([], name="month"),
        )
    periods = daily.index.to_period("M")
    g = daily.groupby(periods)
    out = pd.DataFrame(
        {
            "tmax_monthly_max_c": g.max().astype("float64"),
            "tmax_monthly_mean_c": g.mean().astype("float64"),
        }
    )
    out.index = out.index.to_timestamp()
    out.index.name = "month"
    return out


def monthly_quality(daily: pd.Series) -> pd.DataFrame:
    """Monthly completeness checks for a daily Tmax series."""
    if daily.empty:
        return pd.DataFrame(
            columns=["observed_days", "expected_days", "completeness_pct", "quality_flag"],
            index=pd.DatetimeIndex([], name="month"),
        )

    periods = daily.index.to_period("M")
    observed = daily.groupby(periods).count().astype("int32")
    expected = pd.Series(
        [period.days_in_month for period in observed.index],
        index=observed.index,
        dtype="int32",
    )
    quality = pd.DataFrame(
        {
            "observed_days": observed,
            "expected_days": expected,
        }
    )
    quality["completeness_pct"] = (
        quality["observed_days"] / quality["expected_days"]
    ).astype("float64")
    quality["quality_flag"] = np.where(
        quality["observed_days"] == quality["expected_days"],
        "complete",
        "partial",
    )
    quality.index = quality.index.to_timestamp()
    quality.index.name = "month"
    return quality


def heatwave_days_per_month(
    daily: pd.Series, threshold_c: float = 35.0, min_run: int = 3
) -> pd.Series:
    """Count days that belong to a run of >=`min_run` consecutive days at >=`threshold_c`.

    Days are attributed to their own calendar month, so a run that
    crosses a month boundary contributes to both months correctly.
    """
    if daily.empty:
        return pd.Series(
            dtype="int32", index=pd.DatetimeIndex([], name="month"),
            name="heatwave_days",
        )
    hot = (daily >= threshold_c).astype("int8")
    run_id = (hot != hot.shift()).cumsum()
    run_len = hot.groupby(run_id).transform("sum")
    is_hw_day = (hot == 1) & (run_len >= min_run)

    periods = is_hw_day.index.to_period("M")
    counts = is_hw_day.groupby(periods).sum().astype("int32")
    counts.index = counts.index.to_timestamp()
    counts.index.name = "month"
    counts.name = "heatwave_days"
    return counts


def build_monthly_frame(
    daily: pd.Series,
    district: str,
    threshold_c: float,
    min_run: int,
) -> pd.DataFrame:
    """Combine monthly Tmax stats and heatwave-day counts into the output frame."""
    monthly = monthly_aggregate(daily)
    hw = heatwave_days_per_month(daily, threshold_c=threshold_c, min_run=min_run)
    quality = monthly_quality(daily)
    out = monthly.join(hw, how="left").join(quality, how="left")
    out["heatwave_days"] = out["heatwave_days"].fillna(0).astype("int32")
    out["observed_days"] = out["observed_days"].fillna(0).astype("int32")
    out["expected_days"] = out["expected_days"].fillna(0).astype("int32")
    out["completeness_pct"] = out["completeness_pct"].fillna(0).astype("float64")
    out["quality_flag"] = out["quality_flag"].fillna("empty")
    out.insert(0, "district", district)
    out = out.reset_index()
    out["month"] = out["month"].dt.date
    return out[
        [
            "district",
            "month",
            "tmax_monthly_max_c",
            "tmax_monthly_mean_c",
            "heatwave_days",
            "observed_days",
            "expected_days",
            "completeness_pct",
            "quality_flag",
        ]
    ]


def _find_dim(arr: xr.DataArray, candidates: tuple[str, ...]) -> str:
    for c in candidates:
        if c in arr.dims:
            return c
    raise KeyError(f"none of {candidates} found in dims {arr.dims}")


def _first_temperature_var(ds: xr.Dataset) -> str:
    for name in ds.data_vars:
        if str(name).lower() in {"t2m", "2t", "tas", "temperature_2m"}:
            return str(name)
    raise KeyError(f"no 2m_temperature variable found in {list(ds.data_vars)}")
