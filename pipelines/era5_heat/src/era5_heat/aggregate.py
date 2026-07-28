"""Daily Tmax, monthly aggregation, and heatwave-day counting."""

from __future__ import annotations

import numpy as np
import pandas as pd
import xarray as xr
from shapely import intersects_xy
from shapely.geometry import shape


def to_daily_tmax_c(ds: xr.Dataset, *, geometry: dict | None = None) -> pd.Series:
    """Hourly t2m (K) -> area-level daily Tmax (C).

    Resamples each grid cell to daily max, keeps cell centres inside the selected
    map outline when supplied, then takes a cos(latitude) weighted mean.
    """
    var = "t2m" if "t2m" in ds else _first_temperature_var(ds)
    t2m_c = _temperature_to_celsius(ds[var])

    lat_dim = _find_dim(t2m_c, ("latitude", "lat", "y"))
    lon_dim = _find_dim(t2m_c, ("longitude", "lon", "x"))
    time_dim = _find_dim(t2m_c, ("time", "valid_time"))

    daily_max_grid = t2m_c.resample({time_dim: "1D"}).max()

    if geometry is not None:
        daily_max_grid = _mask_to_geometry(
            daily_max_grid,
            geometry=geometry,
            lat_dim=lat_dim,
            lon_dim=lon_dim,
        )

    latitude = daily_max_grid[lat_dim]
    weights = xr.DataArray(
        np.cos(np.deg2rad(latitude.values)),
        coords={lat_dim: latitude},
        dims=(lat_dim,),
        name="weights",
    )
    district_daily = daily_max_grid.weighted(weights).mean((lat_dim, lon_dim))

    series = district_daily.to_pandas()
    series.index = pd.to_datetime(series.index)
    series.name = "tmax_c"
    return series.astype("float64")


def _temperature_to_celsius(data: xr.DataArray) -> xr.DataArray:
    units = str(data.attrs.get("units") or "").strip().lower().replace("°", "deg")
    if units in {"k", "kelvin"}:
        return data - 273.15
    if units in {
        "c",
        "degc",
        "degree_celsius",
        "degrees_celsius",
        "celsius",
    }:
        return data
    raise ValueError(f"ERA5_TEMPERATURE_UNITS_UNSUPPORTED: {data.attrs.get('units')!r}")


def _mask_to_geometry(
    grid: xr.DataArray,
    *,
    geometry: dict,
    lat_dim: str,
    lon_dim: str,
) -> xr.DataArray:
    area = shape(geometry)
    if area.is_empty or not area.is_valid:
        raise ValueError("ERA5_AREA_GEOMETRY_INVALID")

    longitudes, latitudes = np.meshgrid(
        grid[lon_dim].to_numpy(),
        grid[lat_dim].to_numpy(),
    )
    mask = intersects_xy(area, longitudes, latitudes)
    if not bool(mask.any()):
        raise ValueError("ERA5_AREA_HAS_NO_GRID_CENTRES")
    return grid.where(
        xr.DataArray(
            mask,
            coords={lat_dim: grid[lat_dim], lon_dim: grid[lon_dim]},
            dims=(lat_dim, lon_dim),
        )
    )


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
            columns=[
                "observed_days",
                "expected_days",
                "completeness_pct",
                "quality_flag",
            ],
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
            dtype="int32",
            index=pd.DatetimeIndex([], name="month"),
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
