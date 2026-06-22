"""Output metadata helpers for CHART handoff files."""

from __future__ import annotations

import pandas as pd


def add_handoff_metadata(
    df: pd.DataFrame,
    *,
    climate_source: str,
    climate_dataset: str,
    climate_source_version: str,
    climate_variable: str,
    data_status: str,
    generated_at: str,
    window_start_year: int,
    window_end_year: int,
    threshold_c: float,
    min_run: int,
) -> pd.DataFrame:
    """Attach provenance columns required by the MVP data contract."""
    out = df.copy()
    out["climate_source"] = climate_source
    out["climate_dataset"] = climate_dataset
    out["climate_source_version"] = climate_source_version
    out["climate_variable"] = climate_variable
    out["data_status"] = data_status
    out["generated_at"] = generated_at
    out["window_start_year"] = int(window_start_year)
    out["window_end_year"] = int(window_end_year)
    out["threshold_c"] = float(threshold_c)
    out["min_run"] = int(min_run)
    return out
