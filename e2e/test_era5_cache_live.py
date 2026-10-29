"""Exercise the ERA5 command against disposable, real cached NetCDF grids."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

import numpy as np
import pandas as pd
import xarray as xr

from era5_heat.cds_client import cache_key


def test_parallel_cached_era5_pull_persists_monthly_results(tmp_path: Path) -> None:
    root = Path(__file__).resolve().parents[1]
    evidence = root / "outputs/e2e/sandbox-climate-recovery/era5-cache"
    evidence.mkdir(parents=True, exist_ok=True)
    cache = tmp_path / "cache"
    cache.mkdir()
    bbox = (1.0, 35.0, 0.0, 36.0)
    before = {}
    for year in (2024, 2025):
        hours = pd.date_range(
            f"{year}-01-01", f"{year + 1}-01-01", inclusive="left", freq="h"
        )
        # Synthetic Kelvin temperatures with a known daily maximum: 27 C.
        dataset = xr.Dataset(
            {
                "t2m": (
                    ("valid_time", "latitude", "longitude"),
                    np.full((len(hours), 2, 2), 300.15, dtype="float64"),
                )
            },
            coords={
                "valid_time": hours,
                "latitude": [1.0, 0.0],
                "longitude": [35.0, 36.0],
            },
        )
        dataset.t2m.attrs["units"] = "K"
        path = cache / f"{cache_key(year, bbox)}.nc"
        dataset.to_netcdf(path, engine="netcdf4")
        dataset.close()
        before[path.name] = hashlib.sha256(path.read_bytes()).hexdigest()

    environment = os.environ.copy()
    # Any unexpected cache miss must not contact CDS with real credentials.
    environment["CDSAPI_URL"] = "http://127.0.0.1:1/no-network-expected"
    environment["CDSAPI_KEY"] = "disposable-cache-test"
    record = {
        "revision": subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=root, text=True
        ).strip(),
        "working_tree": subprocess.check_output(
            ["git", "status", "--short"], cwd=root, text=True
        ),
        "fixture": "Synthetic 2024-2025 hourly 2x2 grids, constant 300.15 K",
        "cache_sha256": before,
        "runs": [],
        "result": "running",
    }
    manifest = evidence / "verification.json"
    manifest.write_text(json.dumps(record, indent=2) + "\n")
    try:
        # Repeated process starts exercise native backend initialization and
        # retrying the same cached pull. Both download workers remain enabled.
        for attempt in range(4):
            output = tmp_path / f"output-{attempt}"
            command = [
                sys.executable,
                "-X",
                "faulthandler",
                "-m",
                "era5_heat",
                "--district",
                "disposable-native-cache-fixture",
                "--bbox",
                *map(str, bbox),
                "--years",
                "2",
                "--end-year",
                "2025",
                "--cache-dir",
                str(cache),
                "--outdir",
                str(output),
                "--max-workers",
                "2",
                "-v",
            ]
            log = evidence / f"attempt-{attempt}.log"
            run = {"command": command, "returncode": None, "log": str(log)}
            record["runs"].append(run)
            with log.open("w") as stream:
                process = subprocess.run(
                    command,
                    cwd=root,
                    env=environment,
                    stdout=stream,
                    stderr=subprocess.STDOUT,
                    timeout=45,
                    check=False,
                )
            run["returncode"] = process.returncode
            assert process.returncode == 0, log.read_text()
            basename = "disposable-native-cache-fixture_2024_2025"
            csv = output / f"{basename}.csv"
            metadata = json.loads((output / f"{basename}.json").read_text())
            table = pd.read_csv(csv)
            assert len(table) == metadata["row_count"] == 24
            assert list(table["month"]) == [
                day.strftime("%Y-%m-%d")
                for day in pd.date_range("2024-01-01", "2025-12-01", freq="MS")
            ]
            np.testing.assert_allclose(table["tmax_monthly_mean_c"], 27.0)
            np.testing.assert_allclose(table["tmax_monthly_max_c"], 27.0)
            assert table["heatwave_days"].eq(0).all()
            assert [item["year"] for item in metadata["cache"]] == [2024, 2025]
            assert all(item["cache_hit"] for item in metadata["cache"])
            assert (
                metadata["output_data"]["sha256"]
                == hashlib.sha256(csv.read_bytes()).hexdigest()
            )
            assert {
                path.name: hashlib.sha256(path.read_bytes()).hexdigest()
                for path in cache.glob("*.nc")
            } == before
            # Retain the observable outputs as repeatable evidence.
            (evidence / f"attempt-{attempt}.csv").write_bytes(csv.read_bytes())
            (evidence / f"attempt-{attempt}.json").write_text(
                json.dumps(metadata, indent=2) + "\n"
            )
        record["result"] = "passed"
    except Exception as exc:
        record["result"] = "failed"
        record["error"] = type(exc).__name__
        raise
    finally:
        manifest.write_text(json.dumps(record, indent=2) + "\n")
