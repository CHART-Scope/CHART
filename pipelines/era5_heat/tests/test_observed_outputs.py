"""Validation for generated Sprint 4 observed ERA5 outputs."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import pytest


REPO_ROOT = Path(__file__).resolve().parents[3]
OUTPUT_DIR = REPO_ROOT / "outputs" / "era5_heat"
OUTPUTS = {
    "Madhya Pradesh": OUTPUT_DIR / "madhya-pradesh_2020_2024.csv",
    "Kajiado": OUTPUT_DIR / "kajiado_2020_2024.csv",
}


@pytest.mark.parametrize(("district", "csv_path"), OUTPUTS.items())
def test_observed_era5_output_contract(district: str, csv_path: Path):
    if not csv_path.exists():
        pytest.skip(f"observed ERA5 output not generated: {csv_path}")

    df = pd.read_csv(csv_path)
    assert len(df) == 60
    assert set(df["district"]) == {district}
    assert set(df["data_status"]) == {"observed_reanalysis"}
    assert set(df["climate_source"]) == {"Copernicus Climate Data Store"}
    assert set(df["climate_dataset"]) == {"reanalysis-era5-single-levels"}
    assert set(df["climate_variable"]) == {"2m_temperature"}
    assert set(df["window_start_year"]) == {2020}
    assert set(df["window_end_year"]) == {2024}
    assert set(df["threshold_c"]) == {35.0}
    assert set(df["min_run"]) == {3}
    assert set(df["quality_flag"]) == {"complete"}
    assert (df["completeness_pct"] == 1.0).all()
    assert (df["tmax_monthly_max_c"] >= df["tmax_monthly_mean_c"]).all()
    assert df["heatwave_days"].between(0, 31).all()


@pytest.mark.parametrize(("district", "csv_path"), OUTPUTS.items())
def test_observed_era5_json_sidecar(district: str, csv_path: Path):
    json_path = csv_path.with_suffix(".json")
    if not json_path.exists():
        pytest.skip(f"observed ERA5 sidecar not generated: {json_path}")

    meta = json.loads(json_path.read_text(encoding="utf-8"))
    assert meta["district"] == district
    assert meta["data_status"] == "observed_reanalysis"
    assert meta["source"] == "Copernicus Climate Data Store"
    assert meta["dataset"] == "reanalysis-era5-single-levels"
    assert meta["variable"] == "2m_temperature"
    assert meta["window"] == {"start_year": 2020, "end_year": 2024, "n_years": 5}
    assert meta["heatwave"] == {"threshold_c": 35.0, "min_run": 3}
    assert meta["row_count"] == 60
    assert meta["output_data"]["format"] == "csv"
    assert meta["output_data"]["path"].endswith(csv_path.name)
