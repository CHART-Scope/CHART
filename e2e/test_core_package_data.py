"""The installed core package carries the data files it reads at runtime.

A data file left out of ``[tool.setuptools.package-data]`` still works from a
source checkout, so only a built wheel shows it is missing. The VRA catalogue
was missing this way until the heat-season configuration was added.
"""

from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "outputs/e2e/core/package-data.json"


def test_core_wheel_contains_every_runtime_data_file(tmp_path: Path) -> None:
    subprocess.run(
        [sys.executable, "-m", "pip", "wheel", str(ROOT / "core"), "--no-deps"]
        + ["-q", "-w", str(tmp_path)],
        check=True,
    )
    (wheel,) = tmp_path.glob("*.whl")
    shipped = set(zipfile.ZipFile(wheel).namelist())
    expected = {
        f"chart/{path.relative_to(ROOT / 'core/chart')}"
        for path in (ROOT / "core/chart").rglob("*.json")
        if "__pycache__" not in path.parts
    }
    missing = sorted(expected - shipped)
    EVIDENCE.parent.mkdir(parents=True, exist_ok=True)
    EVIDENCE.write_text(
        json.dumps(
            {"wheel": wheel.name, "expected": sorted(expected), "missing": missing},
            indent=2,
        )
        + "\n"
    )
    assert missing == []
