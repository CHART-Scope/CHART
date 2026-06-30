"""Tabular data + JSON output writers."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Literal

import pandas as pd


def slugify(name: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", name.strip().lower()).strip("-")
    return s or "district"


TableFormat = Literal["csv", "parquet"]


def output_paths(
    outdir: Path,
    district: str,
    start_year: int,
    end_year: int,
    table_format: TableFormat = "csv",
) -> tuple[Path, Path]:
    if table_format not in {"csv", "parquet"}:
        raise ValueError("table_format must be 'csv' or 'parquet'")
    outdir.mkdir(parents=True, exist_ok=True)
    base = f"{slugify(district)}_{start_year}_{end_year}"
    return outdir / f"{base}.{table_format}", outdir / f"{base}.json"


def write_table(df: pd.DataFrame, path: Path, table_format: TableFormat = "csv") -> str:
    if table_format == "csv":
        df.to_csv(path, index=False)
        return _sha256_file(path)
    if table_format == "parquet":
        return write_parquet(df, path)
    raise ValueError("table_format must be 'csv' or 'parquet'")


def write_parquet(df: pd.DataFrame, path: Path) -> str:
    df.to_parquet(path, engine="pyarrow", index=False)
    return _sha256_file(path)


def write_json(meta: dict, path: Path) -> None:
    path.write_text(json.dumps(meta, indent=2, default=str))


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()
