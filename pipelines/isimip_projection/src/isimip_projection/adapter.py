from __future__ import annotations

import hashlib
import json
import os
import random
import shutil
import time
import uuid
import zipfile
from dataclasses import asdict, dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Protocol
from urllib.parse import urlparse

import numpy as np
import xarray as xr
from shapely import contains_xy
from shapely.geometry import shape

ISIMIP_SOURCE_URI = "https://data.isimip.org"
ISIMIP_DATASET_NAME = "ISIMIP3b bias-adjusted atmospheric climate input data"
ISIMIP_DATASET_DOI = "https://doi.org/10.48364/ISIMIP.842396.1"
APPROVED_SCENARIOS = ("ssp126", "ssp370", "ssp585")
APPROVED_PERIODS = ((2031, 2040),)
APPROVED_MODELS = (
    "gfdl-esm4",
    "ipsl-cm6a-lr",
    "mpi-esm1-2-hr",
    "mri-esm2-0",
    "ukesm1-0-ll",
)


class RepositoryClient(Protocol):
    def datasets(self, **kwargs): ...

    def cutout_bbox(
        self,
        paths,
        west,
        east,
        south,
        north,
        mean=False,
        csv=False,
        poll=None,
    ): ...

    def download(self, url, path=None, validate=False, extract=False): ...

    def get_job(self, job_url, poll=None): ...


@dataclass(frozen=True)
class ProjectionRequest:
    scenario: str
    start_year: int
    end_year: int
    season_months: tuple[int, int, int]
    bbox: tuple[float, float, float, float]
    geometry: dict
    admin_unit_code: str
    admin_unit_level: str
    boundary_version: str
    output_dir: Path
    models: tuple[str, ...] = APPROVED_MODELS


@dataclass(frozen=True)
class ProjectionDownload:
    values_c: dict[date, float]
    ranges_c: dict[date, tuple[float, float]]
    member_values_c: dict[str, dict[date, float]]
    raw_object_uri: str
    raw_object_hash: str
    manifest_uri: str
    source_version: str
    ensemble_summary: str
    scenario: str
    valid_from: date
    valid_to: date


def prepare_projection_records(
    request: ProjectionRequest,
    *,
    client: RepositoryClient | None = None,
) -> ProjectionDownload:
    """Fetch one approved ISIMIP3b cut-out and aggregate it to one place."""

    _validate_request(request)
    request_dir = request.output_dir / _request_key(request)
    request_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = request_dir / "manifest.json"

    cached = _read_cached_result(manifest_path, request)
    if cached is not None:
        return cached

    if client is None:
        from isimip_client.client import ISIMIPClient

        client = ISIMIPClient()

    datasets = [
        _find_dataset_file(
            client,
            model=model,
            scenario=request.scenario,
            start_year=request.start_year,
            end_year=request.end_year,
        )
        for model in request.models
    ]
    paths = [item["path"] for item in datasets]
    north, west, south, east = request.bbox
    job = _prepare_cutout(
        client,
        paths=paths,
        west=west,
        east=east,
        south=south,
        north=north,
    )
    if not job or job.get("status") != "finished" or not job.get("file_url"):
        status = job.get("status") if isinstance(job, dict) else "no response"
        raise RuntimeError(f"ISIMIP_CUTOUT_NOT_READY: {status}")

    work_dir = request_dir / f".work-{uuid.uuid4().hex}"
    work_dir.mkdir()
    try:
        archive_path = _download_archive(client, job["file_url"], work_dir)
        extract_dir = work_dir / "cutout"
        extract_dir.mkdir()
        with zipfile.ZipFile(archive_path) as archive:
            _safe_extract(archive, extract_dir)

        member_values = _aggregate_members(
            extract_dir,
            models=request.models,
            geometry=request.geometry,
            start_year=request.start_year,
            end_year=request.end_year,
            season_months=request.season_months,
        )
        retained_archive = request_dir / "cutout.zip"
        archive_hash = _sha256(archive_path)
        archive_size = archive_path.stat().st_size
        os.replace(archive_path, retained_archive)
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)
    anchor_values, ranges = _ensemble_values(member_values, request.end_year)
    source_versions = sorted({str(item["version"]) for item in datasets})
    manifest = {
        "contract": "chart-isimip3b-projection-v1",
        "request": _request_payload(request),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": {
            "name": ISIMIP_DATASET_NAME,
            "uri": ISIMIP_DATASET_DOI,
            "repository": ISIMIP_SOURCE_URI,
            "versions": source_versions,
            "bias_adjustment": "W5E5 v2.0",
            "resolution": "0.5 degree",
            "license": "CC0 1.0",
        },
        "files": datasets,
        "cutout_job": {
            "id": job.get("id"),
            "job_url": job.get("job_url"),
        },
        "cutout_archive": {
            "filename": retained_archive.name,
            "sha256": archive_hash,
            "size_bytes": archive_size,
        },
        "member_values_c": _json_month_values(member_values),
        "ensemble_median_c": _json_date_values(anchor_values),
        "ensemble_range_c": {
            month.isoformat(): [bounds[0], bounds[1]]
            for month, bounds in ranges.items()
        },
    }
    _atomic_write_text(
        manifest_path,
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
    )
    return ProjectionDownload(
        values_c=anchor_values,
        ranges_c=ranges,
        member_values_c=member_values,
        raw_object_uri=str(retained_archive),
        raw_object_hash=archive_hash,
        manifest_uri=str(manifest_path),
        source_version="/".join(source_versions),
        ensemble_summary=f"median of {len(member_values)} approved climate models",
        scenario=request.scenario,
        valid_from=date(request.start_year, 1, 1),
        valid_to=date(request.end_year, 12, 31),
    )


def _prepare_cutout(
    client: RepositoryClient,
    *,
    paths: list[str],
    west: float,
    east: float,
    south: float,
    north: float,
    timeout_seconds: int = 45 * 60,
) -> dict:
    job = client.cutout_bbox(
        paths,
        west=west,
        east=east,
        south=south,
        north=north,
        poll=None,
    )
    deadline = time.monotonic() + timeout_seconds
    while isinstance(job, dict) and job.get("status") in {"queued", "started"}:
        if time.monotonic() >= deadline:
            raise TimeoutError("ISIMIP_CUTOUT_TIMED_OUT")
        job_url = job.get("job_url")
        if not job_url:
            raise RuntimeError("ISIMIP_CUTOUT_JOB_URL_MISSING")
        elapsed = timeout_seconds - max(0, int(deadline - time.monotonic()))
        delay = min(30.0, 2.0 * (2 ** min(4, elapsed // 60)))
        time.sleep(delay + random.uniform(0, delay * 0.2))
        job = client.get_job(job_url, poll=None)
    return job


def _find_dataset_file(
    client: RepositoryClient,
    *,
    model: str,
    scenario: str,
    start_year: int,
    end_year: int,
) -> dict:
    response = client.datasets(
        simulation_round="ISIMIP3b",
        product="InputData",
        climate_forcing=model,
        climate_scenario=scenario,
        climate_variable="tasmax",
    )
    results = response.get("results", []) if isinstance(response, dict) else response
    if len(results) != 1:
        raise ValueError(f"ISIMIP_DATASET_NOT_UNIQUE: {model} {scenario}")
    dataset = results[0]
    suffix = f"_{start_year}_{end_year}.nc"
    matching = [
        item for item in dataset.get("files", []) if item["name"].endswith(suffix)
    ]
    if len(matching) != 1:
        raise ValueError(
            f"ISIMIP_PERIOD_FILE_NOT_UNIQUE: {model} {scenario} {start_year}-{end_year}"
        )
    item = matching[0]
    return {
        "model": model,
        "dataset_id": dataset["id"],
        "dataset_version": dataset["version"],
        "file_id": item["id"],
        "name": item["name"],
        "path": item["path"],
        "version": item["version"],
        "checksum": item["checksum"],
        "checksum_type": item["checksum_type"],
        "metadata_url": item["metadata_url"],
    }


def _download_archive(client: RepositoryClient, url: str, target_dir: Path) -> Path:
    filename = Path(urlparse(url).path).name or "isimip-cutout.zip"
    archive_path = target_dir / filename
    if archive_path.exists():
        archive_path.unlink()
    client.download(url, path=str(target_dir))
    if not archive_path.is_file() or not zipfile.is_zipfile(archive_path):
        raise RuntimeError("ISIMIP_CUTOUT_ARCHIVE_INVALID")
    return archive_path


def _safe_extract(archive: zipfile.ZipFile, destination: Path) -> None:
    root = destination.resolve()
    members = archive.infolist()
    max_members = int(os.getenv("CLIMATE_ARCHIVE_MAX_MEMBERS", "1000"))
    max_bytes = int(
        os.getenv("CLIMATE_ARCHIVE_MAX_UNCOMPRESSED_BYTES", str(5 * 1024**3))
    )
    total_bytes = sum(member.file_size for member in members)
    reserve_bytes = int(os.getenv("CLIMATE_MIN_FREE_BYTES", str(1024**3)))
    if len(members) > max_members or total_bytes > max_bytes:
        raise RuntimeError("ISIMIP_ARCHIVE_SIZE_INVALID")
    if total_bytes > max(0, shutil.disk_usage(destination).free - reserve_bytes):
        raise RuntimeError("ISIMIP_ARCHIVE_STORAGE_INSUFFICIENT")
    for member in members:
        target = (destination / member.filename).resolve()
        if root not in target.parents and target != root:
            raise RuntimeError("ISIMIP_ARCHIVE_PATH_INVALID")
        if member.flag_bits & 0x1:
            raise RuntimeError("ISIMIP_ARCHIVE_ENCRYPTED")
        if member.file_size and (
            member.compress_size == 0 or member.file_size / member.compress_size > 1000
        ):
            raise RuntimeError("ISIMIP_ARCHIVE_COMPRESSION_INVALID")
    archive.extractall(destination)


def _atomic_write_text(path: Path, value: str) -> None:
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.partial")
    try:
        temporary.write_text(value, encoding="utf-8")
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def _aggregate_members(
    directory: Path,
    *,
    models: tuple[str, ...],
    geometry: dict,
    start_year: int,
    end_year: int,
    season_months: tuple[int, int, int],
) -> dict[str, dict[date, float]]:
    files = sorted(directory.rglob("*.nc"))
    member_values: dict[str, dict[date, float]] = {}
    for model in models:
        normalized = model.replace("-", "")
        matches = [
            path
            for path in files
            if normalized in path.name.lower().replace("-", "").replace("_", "")
        ]
        if len(matches) != 1:
            raise ValueError(f"ISIMIP_CUTOUT_MEMBER_NOT_UNIQUE: {model}")
        dataset = xr.open_dataset(matches[0], decode_times=True)
        try:
            values = _monthly_polygon_climatology(
                dataset,
                geometry=geometry,
                start_year=start_year,
                end_year=end_year,
                season_months=season_months,
            )
        finally:
            dataset.close()
        member_values[model] = {
            date(end_year, month, 1): value for month, value in values.items()
        }
    return member_values


def _monthly_polygon_climatology(
    dataset: xr.Dataset,
    *,
    geometry: dict,
    start_year: int,
    end_year: int,
    season_months: tuple[int, int, int],
) -> dict[int, float]:
    data = dataset["tasmax"] if "tasmax" in dataset.data_vars else _only_array(dataset)
    lat_name = _coordinate_name(data, "lat", "latitude")
    lon_name = _coordinate_name(data, "lon", "longitude")
    time_name = _coordinate_name(data, "time")
    selected = data.sel({time_name: slice(f"{start_year}-01-01", f"{end_year}-12-31")})
    lat = selected[lat_name]
    lon = selected[lon_name]
    lon_grid, lat_grid = np.meshgrid(lon.values, lat.values)
    mask = contains_xy(shape(geometry), lon_grid, lat_grid)
    if not bool(mask.any()):
        raise ValueError("ISIMIP_POLYGON_HAS_NO_GRID_CELLS")
    mask_array = xr.DataArray(
        mask,
        coords={lat_name: lat, lon_name: lon},
        dims=(lat_name, lon_name),
    )
    weights = xr.DataArray(
        np.cos(np.deg2rad(lat.values)).clip(min=0),
        coords={lat_name: lat},
        dims=(lat_name,),
        name="weights",
    )
    spatial = (
        selected.where(mask_array)
        .weighted(weights)
        .mean(dim=(lat_name, lon_name), skipna=True)
    )
    monthly = spatial.groupby(f"{time_name}.month").mean(dim=time_name, skipna=True)
    units = data.attrs.get("units")
    output: dict[int, float] = {}
    for month in season_months:
        value = float(monthly.sel(month=month).item())
        output[month] = _to_celsius(value, units)
    return output


def _ensemble_values(
    member_values: dict[str, dict[date, float]], end_year: int
) -> tuple[dict[date, float], dict[date, tuple[float, float]]]:
    months = sorted(next(iter(member_values.values())))
    central: dict[date, float] = {}
    ranges: dict[date, tuple[float, float]] = {}
    for month in months:
        values = np.asarray(
            [item[month] for item in member_values.values()], dtype=float
        )
        anchor = date(end_year, month.month, 1)
        central[anchor] = float(np.median(values))
        ranges[anchor] = (float(values.min()), float(values.max()))
    return central, ranges


def _read_cached_result(
    manifest_path: Path, request: ProjectionRequest
) -> ProjectionDownload | None:
    if not manifest_path.is_file():
        return None
    try:
        payload = json.loads(manifest_path.read_text(encoding="utf-8"))
        if payload.get("request") != _request_payload(request):
            return None
        member_values = {
            model: {
                date.fromisoformat(month): float(value)
                for month, value in values.items()
            }
            for model, values in payload["member_values_c"].items()
        }
        central = {
            date.fromisoformat(month): float(value)
            for month, value in payload["ensemble_median_c"].items()
        }
        ranges = {
            date.fromisoformat(month): (float(values[0]), float(values[1]))
            for month, values in payload["ensemble_range_c"].items()
        }
        versions = payload["source"]["versions"]
        archive_metadata = payload["cutout_archive"]
        archive_path = manifest_path.parent / str(archive_metadata["filename"])
        archive_hash = str(archive_metadata["sha256"])
        if (
            archive_path.parent != manifest_path.parent
            or not archive_path.is_file()
            or _sha256(archive_path) != archive_hash
        ):
            raise ValueError("cached cutout archive is missing or corrupt")
    except (OSError, json.JSONDecodeError, KeyError, TypeError, ValueError):
        quarantine_path = manifest_path.with_name(
            f"{manifest_path.name}.{uuid.uuid4().hex}.corrupt"
        )
        try:
            manifest_path.replace(quarantine_path)
        except FileNotFoundError:
            pass
        return None
    return ProjectionDownload(
        values_c=central,
        ranges_c=ranges,
        member_values_c=member_values,
        raw_object_uri=str(archive_path),
        raw_object_hash=archive_hash,
        manifest_uri=str(manifest_path),
        source_version="/".join(versions),
        ensemble_summary=f"median of {len(member_values)} approved climate models",
        scenario=request.scenario,
        valid_from=date(request.start_year, 1, 1),
        valid_to=date(request.end_year, 12, 31),
    )


def _to_celsius(value: float, raw_units: object) -> float:
    if not np.isfinite(value):
        raise ValueError("ISIMIP_TEMPERATURE_NOT_FINITE")
    units = str(raw_units or "").strip().lower().replace("°", "deg")
    if units in {"k", "kelvin"}:
        return value - 273.15
    if units in {
        "c",
        "degc",
        "celsius",
        "degree_celsius",
        "degrees_celsius",
    }:
        return value
    raise ValueError(f"ISIMIP_TEMPERATURE_UNITS_UNSUPPORTED: {raw_units!r}")


def _validate_request(request: ProjectionRequest) -> None:
    if request.scenario not in APPROVED_SCENARIOS:
        raise ValueError(f"ISIMIP_SCENARIO_NOT_APPROVED: {request.scenario}")
    if (request.start_year, request.end_year) not in APPROVED_PERIODS:
        raise ValueError(
            f"ISIMIP_PERIOD_NOT_APPROVED: {request.start_year}-{request.end_year}"
        )
    if request.season_months != (3, 4, 5):
        raise ValueError("ISIMIP_SEASON_NOT_APPROVED: expected March-May")
    if not request.models or any(
        model not in APPROVED_MODELS for model in request.models
    ):
        raise ValueError("ISIMIP_MODEL_NOT_APPROVED")
    if len(set(request.models)) != len(request.models):
        raise ValueError("ISIMIP_MODEL_DUPLICATE")


def _request_payload(request: ProjectionRequest) -> dict:
    payload = asdict(request)
    payload["output_dir"] = str(request.output_dir)
    payload["models"] = list(request.models)
    payload["season_months"] = list(request.season_months)
    payload["bbox"] = list(request.bbox)
    return json.loads(json.dumps(payload, sort_keys=True))


def _request_key(request: ProjectionRequest) -> str:
    payload = _request_payload(request).copy()
    payload.pop("output_dir")
    digest = hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()[:12]
    return (
        f"{request.admin_unit_code}-{request.scenario}-"
        f"{request.start_year}-{request.end_year}-{digest}"
    )


def _only_array(dataset: xr.Dataset) -> xr.DataArray:
    if len(dataset.data_vars) != 1:
        raise ValueError("ISIMIP_TASMAX_VARIABLE_NOT_FOUND")
    return next(iter(dataset.data_vars.values()))


def _coordinate_name(data: xr.DataArray, *names: str) -> str:
    for name in names:
        if name in data.coords or name in data.dims:
            return name
    raise ValueError(f"ISIMIP_COORDINATE_NOT_FOUND: {', '.join(names)}")


def _json_month_values(values: dict[str, dict[date, float]]) -> dict:
    return {
        model: _json_date_values(month_values) for model, month_values in values.items()
    }


def _json_date_values(values: dict[date, float]) -> dict[str, float]:
    return {month.isoformat(): value for month, value in values.items()}


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()
