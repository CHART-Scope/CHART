"""Unit tests for aggregate.py — deterministic in-memory data, no network."""

from __future__ import annotations

import numpy as np
import pandas as pd
import xarray as xr

from era5_heat.aggregate import (
    build_monthly_frame,
    heatwave_days_per_month,
    monthly_aggregate,
    monthly_quality,
    to_daily_tmax_c,
)


def _daily(values: list[float], start: str = "2024-01-01") -> pd.Series:
    idx = pd.date_range(start=start, periods=len(values), freq="D")
    return pd.Series(values, index=idx, name="tmax_c", dtype="float64")


def test_runs_only_count_when_length_ge_min_run():
    # 1-day, 2-day, then 3-day, then 5-day hot stretches.
    # Cool days separate the runs. Cool = 20 C, Hot = 36 C, threshold 35.
    cool = [20.0] * 2
    s = _daily(
        [36.0] + cool                       # 1-day run -> 0 counted
        + [36.0, 36.0] + cool               # 2-day run -> 0 counted
        + [36.0, 36.0, 36.0] + cool         # 3-day run -> 3 counted
        + [36.0, 36.0, 36.0, 36.0, 36.0]    # 5-day run -> 5 counted
    )
    counts = heatwave_days_per_month(s, threshold_c=35.0, min_run=3)
    assert int(counts.sum()) == 3 + 5


def test_run_straddling_month_boundary_attributes_days_correctly():
    # Run of 6 days: Jul 30, 31, Aug 1, 2, 3, 4 -> 2 to Jul, 4 to Aug.
    idx = pd.date_range("2024-07-29", "2024-08-05", freq="D")
    vals = [20.0] + [36.0] * 6 + [20.0]
    s = pd.Series(vals, index=idx, dtype="float64")
    counts = heatwave_days_per_month(s, threshold_c=35.0, min_run=3)
    assert int(counts.loc["2024-07-01"]) == 2
    assert int(counts.loc["2024-08-01"]) == 4


def test_threshold_edges_at_3499_and_3500():
    # 35.00 counts; 34.99 does not.
    s_just_below = _daily([34.99] * 5)
    s_at_threshold = _daily([35.00] * 5)
    assert int(heatwave_days_per_month(s_just_below, 35.0, 3).sum()) == 0
    assert int(heatwave_days_per_month(s_at_threshold, 35.0, 3).sum()) == 5


def test_all_hot_month_counts_every_day():
    s = pd.Series(
        [36.0] * 31,
        index=pd.date_range("2024-07-01", "2024-07-31", freq="D"),
        dtype="float64",
    )
    counts = heatwave_days_per_month(s, 35.0, 3)
    assert int(counts.loc["2024-07-01"]) == 31


def test_empty_all_cool_month_returns_zero_for_that_month():
    s = _daily([20.0] * 31, start="2024-07-01")
    df = build_monthly_frame(s, district="x", threshold_c=35.0, min_run=3)
    assert int(df.loc[df["month"] == pd.Timestamp("2024-07-01").date(), "heatwave_days"].iloc[0]) == 0


def test_monthly_quality_flags_partial_month():
    s = _daily([20.0] * 29, start="2024-07-01")
    q = monthly_quality(s)
    assert int(q.loc["2024-07-01", "observed_days"]) == 29
    assert int(q.loc["2024-07-01", "expected_days"]) == 31
    assert q.loc["2024-07-01", "quality_flag"] == "partial"
    assert q.loc["2024-07-01", "completeness_pct"] < 1.0


def test_monthly_max_ge_monthly_mean():
    rng = np.random.default_rng(seed=42)
    vals = 25.0 + 10.0 * rng.standard_normal(365)
    s = pd.Series(vals, index=pd.date_range("2024-01-01", periods=365, freq="D"))
    m = monthly_aggregate(s)
    assert (m["tmax_monthly_max_c"] >= m["tmax_monthly_mean_c"] - 1e-9).all()


def test_build_monthly_frame_schema():
    s = _daily([20.0, 36.0, 36.0, 36.0, 20.0])
    df = build_monthly_frame(s, district="Testville", threshold_c=35.0, min_run=3)
    assert list(df.columns) == [
        "district", "month", "tmax_monthly_max_c",
        "tmax_monthly_mean_c", "heatwave_days", "observed_days",
        "expected_days", "completeness_pct", "quality_flag",
    ]
    assert (df["district"] == "Testville").all()
    assert df["heatwave_days"].dtype == np.int32
    assert df["observed_days"].dtype == np.int32
    assert df["expected_days"].dtype == np.int32
    assert (df["quality_flag"] == "partial").all()
    assert int(df["heatwave_days"].sum()) == 3


def test_to_daily_tmax_c_from_in_memory_xarray():
    # 2 days x 2 lat x 2 lon, hourly. Build temperatures so the daily
    # max is known per cell, then the cos(lat) weighted mean is testable.
    times = pd.date_range("2024-06-01", periods=48, freq="h")
    lats = np.array([10.0, 11.0])
    lons = np.array([20.0, 21.0])

    # For each (lat, lon, day) set Tmax (in C) explicitly at hour 12.
    tmax_c_per_cell = np.array(
        [
            [[30.0, 32.0], [34.0, 36.0]],  # day 0: lat x lon
            [[20.0, 22.0], [24.0, 26.0]],  # day 1
        ]
    )

    data_k = np.zeros((48, 2, 2), dtype="float64")
    for day in range(2):
        # baseline 280 K for all hours then bump hour 12 to tmax
        data_k[day * 24 : (day + 1) * 24, :, :] = 280.0
        data_k[day * 24 + 12, :, :] = tmax_c_per_cell[day] + 273.15

    ds = xr.Dataset(
        {"t2m": (("time", "latitude", "longitude"), data_k)},
        coords={"time": times, "latitude": lats, "longitude": lons},
    )

    series = to_daily_tmax_c(ds)
    assert len(series) == 2

    w = np.cos(np.deg2rad(lats))
    for day in range(2):
        expected = (tmax_c_per_cell[day] * w[:, None]).sum() / (w.sum() * 2)
        # Two lon cells with equal weight per lat row -> divide by 2.
        np.testing.assert_allclose(series.iloc[day], expected, rtol=1e-9)
