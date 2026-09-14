from __future__ import annotations

import json
import zipfile
from datetime import date
from pathlib import Path

import numpy as np
import pytest
import xarray as xr
from shapely.geometry import box, mapping

from isimip_projection import ProjectionRequest, prepare_projection_records


class FakeClient:
    def __init__(self, source_archives: dict[str, Path], work_dir: Path) -> None:
        self.source_archives = source_archives
        self.work_dir = work_dir
        self.cutout_calls = 0

    def datasets(self, **kwargs):
        model = kwargs["climate_forcing"]
        name = f"{model}_ssp370_tasmax_global_daily_2031_2040.nc"
        return [
            {
                "id": f"dataset-{model}",
                "version": "20210512",
                "files": [
                    {
                        "id": f"file-{model}",
                        "name": name,
                        "path": f"remote/{name}",
                        "version": "20210512",
                        "checksum": "source-sha512",
                        "checksum_type": "sha512",
                        "metadata_url": f"https://data.isimip.org/files/{model}",
                    }
                ],
            }
        ]

    def cutout_bbox(self, paths, west, east, south, north, **kwargs):
        self.cutout_calls += 1
        archive = self.work_dir / "prepared.zip"
        with zipfile.ZipFile(archive, "w") as output:
            for path in paths:
                model = Path(path).name.split("_ssp370")[0]
                output.write(self.source_archives[model], arcname=Path(path).name)
        return {
            "id": "job-1",
            "status": "finished",
            "job_url": "https://files.isimip.org/jobs/job-1",
            "file_url": f"https://files.example/{archive.name}",
        }

    def download(self, url, path=None, **kwargs):
        target = Path(path) / Path(url).name
        target.write_bytes((self.work_dir / Path(url).name).read_bytes())


def test_projection_uses_ensemble_median_and_writes_trace_manifest(tmp_path: Path):
    models = ("gfdl-esm4", "ipsl-cm6a-lr", "mri-esm2-0")
    sources = {
        model: _write_member(tmp_path, model, 300.0 + index * 2)
        for index, model in enumerate(models)
    }
    client = FakeClient(sources, tmp_path)
    request = ProjectionRequest(
        scenario="ssp370",
        start_year=2031,
        end_year=2040,
        season_months=(3, 4, 5),
        bbox=(24.0, 74.0, 20.0, 79.0),
        geometry=mapping(box(74.0, 20.0, 79.0, 24.0)),
        admin_unit_code="madhya-pradesh",
        admin_unit_level="state",
        boundary_version="test-v1",
        output_dir=tmp_path / "output",
        models=models,
    )

    result = prepare_projection_records(request, client=client)

    assert result.values_c[date(2040, 3, 1)] == pytest.approx(28.85)
    assert result.ranges_c[date(2040, 3, 1)] == pytest.approx((26.85, 30.85))
    assert result.scenario == "ssp370"
    assert result.valid_from == date(2031, 1, 1)
    assert result.valid_to == date(2040, 12, 31)
    manifest = json.loads(Path(result.manifest_uri).read_text())
    assert Path(result.raw_object_uri).read_bytes().startswith(b"PK")
    assert result.raw_object_hash == manifest["cutout_archive"]["sha256"]
    assert len(manifest["files"]) == 3
    assert manifest["source"]["bias_adjustment"] == "W5E5 v2.0"
    assert len(result.raw_object_hash) == 64

    cached = prepare_projection_records(request, client=client)
    assert cached.values_c == result.values_c
    assert client.cutout_calls == 1


def test_projection_rejects_a_silent_or_unapproved_scenario(tmp_path: Path):
    request = ProjectionRequest(
        scenario="ssp245",
        start_year=2031,
        end_year=2040,
        season_months=(3, 4, 5),
        bbox=(24.0, 74.0, 20.0, 79.0),
        geometry=mapping(box(74.0, 20.0, 79.0, 24.0)),
        admin_unit_code="madhya-pradesh",
        admin_unit_level="state",
        boundary_version="test-v1",
        output_dir=tmp_path,
    )

    try:
        prepare_projection_records(request, client=FakeClient({}, tmp_path))
    except ValueError as error:
        assert str(error) == "ISIMIP_SCENARIO_NOT_APPROVED: ssp245"
    else:
        raise AssertionError("Expected the unapproved scenario to be rejected")


def _write_member(tmp_path: Path, model: str, base_kelvin: float) -> Path:
    times = np.asarray(
        [
            np.datetime64(f"{year}-{month:02d}-15")
            for year in range(2031, 2041)
            for month in (3, 4, 5)
        ]
    )
    values = np.empty((len(times), 2, 2), dtype=float)
    for index, timestamp in enumerate(times):
        month = int(str(timestamp)[5:7])
        values[index, :, :] = base_kelvin + (month - 3)
    dataset = xr.Dataset(
        {
            "tasmax": (
                ("time", "lat", "lon"),
                values,
                {"units": "K"},
            )
        },
        coords={"time": times, "lat": [21.0, 22.0], "lon": [75.0, 76.0]},
    )
    path = tmp_path / f"{model}_ssp370_tasmax_global_daily_2031_2040.nc"
    dataset.to_netcdf(path)
    return path
