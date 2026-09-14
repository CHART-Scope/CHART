"""Tests for output path and table writers."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from era5_heat.__main__ import _parse_args
from era5_heat.io import output_paths, write_table


def test_cli_default_outdir_is_cwd_relative_outputs_dir():
    args = _parse_args(["--preset", "madhya-pradesh"])
    assert args.outdir == Path("outputs") / "era5_heat"


def test_output_paths_default_to_csv(tmp_path):
    table_path, json_path = output_paths(tmp_path, "Madhya Pradesh", 2020, 2024)
    assert table_path.name == "madhya-pradesh_2020_2024.csv"
    assert json_path.name == "madhya-pradesh_2020_2024.json"


def test_write_table_csv_returns_sha(tmp_path):
    path = tmp_path / "sample.csv"
    sha = write_table(pd.DataFrame({"a": [1], "b": ["x"]}), path)
    assert len(sha) == 64
    assert path.read_text(encoding="utf-8").splitlines() == ["a,b", "1,x"]
