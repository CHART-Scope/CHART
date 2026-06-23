"""Tests for provenance metadata attached to handoff rows."""

from __future__ import annotations

import pandas as pd

from era5_heat.provenance import add_handoff_metadata


def test_add_handoff_metadata_attaches_required_contract_columns():
    df = pd.DataFrame(
        {
            "district": ["Madhya Pradesh"],
            "month": [pd.Timestamp("2020-01-01").date()],
            "tmax_monthly_max_c": [26.2],
            "heatwave_days": [0],
        }
    )

    out = add_handoff_metadata(
        df,
        climate_source="Copernicus Climate Data Store",
        climate_dataset="reanalysis-era5-single-levels",
        climate_source_version="ERA5 hourly data on single levels",
        climate_variable="2m_temperature",
        data_status="observed_reanalysis",
        generated_at="2026-06-22T10:42:18+00:00",
        window_start_year=2020,
        window_end_year=2024,
        threshold_c=35.0,
        min_run=3,
    )

    assert out.loc[0, "climate_source"] == "Copernicus Climate Data Store"
    assert out.loc[0, "climate_dataset"] == "reanalysis-era5-single-levels"
    assert out.loc[0, "climate_source_version"] == "ERA5 hourly data on single levels"
    assert out.loc[0, "climate_variable"] == "2m_temperature"
    assert out.loc[0, "data_status"] == "observed_reanalysis"
    assert out.loc[0, "generated_at"] == "2026-06-22T10:42:18+00:00"
    assert out.loc[0, "window_start_year"] == 2020
    assert out.loc[0, "window_end_year"] == 2024
    assert out.loc[0, "threshold_c"] == 35.0
    assert out.loc[0, "min_run"] == 3
