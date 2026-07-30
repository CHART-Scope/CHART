from __future__ import annotations

import hashlib
import os
import shutil
import uuid
import zipfile
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Protocol

import numpy as np
import xarray as xr
from shapely import contains_xy
from shapely.geometry import shape

C3S_DATASET = "seasonal-monthly-single-levels"
C3S_SOURCE_URI = (
    "https://cds.climate.copernicus.eu/datasets/seasonal-monthly-single-levels"
)
C3S_VARIABLE = "maximum_2m_temperature_in_the_last_24_hours"


class RetrievalClient(Protocol):
    def retrieve(self, dataset: str, request: dict, target: str): ...


@dataclass(frozen=True)
class SeasonalRequest:
    issue_month: date
    target_months: tuple[date, ...]
    bbox: tuple[float, float, float, float]
    geometry: dict
    admin_unit_code: str
    admin_unit_level: str
    boundary_version: str
    output_path: Path
    system: str = "51"


@dataclass(frozen=True)
class SeasonalDownload:
    values_c: dict[date, float]
    issue_time: datetime
    raw_object_uri: str
    raw_object_hash: str
    source_version: str
    ensemble_summary: str


def latest_available_issue_month(now: datetime | None = None) -> date:
    """ECMWF C3S releases on the 6th; allow one extra day for publication."""

    current = (now or datetime.now(timezone.utc)).date()
    if current.day >= 7:
        return current.replace(day=1)
    return _previous_month(current.replace(day=1))


def prepare_seasonal_records(
    request: SeasonalRequest,
    *,
    client: RetrievalClient | None = None,
) -> SeasonalDownload:
    """Download one C3S issue and return polygon-averaged monthly daily Tmax."""

    lead_by_month = {
        target: _month_distance(request.issue_month, target) + 1
        for target in request.target_months
    }
    if any(lead < 1 or lead > 6 for lead in lead_by_month.values()):
        raise ValueError("C3S_TARGET_OUTSIDE_SIX_MONTH_WINDOW")

    if client is None:
        import cdsapi

        client = cdsapi.Client()
    request.output_path.parent.mkdir(parents=True, exist_ok=True)
    north, west, south, east = request.bbox
    temporary_path = request.output_path.with_name(
        f".{request.output_path.name}.{uuid.uuid4().hex}.partial"
    )
    try:
        client.retrieve(
            C3S_DATASET,
            {
                "originating_centre": "ecmwf",
                "system": request.system,
                "variable": [C3S_VARIABLE],
                "product_type": ["monthly_mean"],
                "year": [f"{request.issue_month.year:04d}"],
                "month": [f"{request.issue_month.month:02d}"],
                "leadtime_month": [str(value) for value in lead_by_month.values()],
                "area": [north, west, south, east],
                "data_format": "netcdf",
            },
            str(temporary_path),
        )
        if not temporary_path.is_file() or temporary_path.stat().st_size == 0:
            raise ValueError("C3S_DOWNLOAD_EMPTY")
        dataset = _open_download(temporary_path)
        try:
            values = _monthly_polygon_values(
                dataset,
                lead_by_month=lead_by_month,
                geometry=request.geometry,
            )
        finally:
            dataset.close()
        raw_hash = _sha256(temporary_path)
        os.replace(temporary_path, request.output_path)
    finally:
        temporary_path.unlink(missing_ok=True)
    return SeasonalDownload(
        values_c=values,
        issue_time=datetime(
            request.issue_month.year,
            request.issue_month.month,
            1,
            tzinfo=timezone.utc,
        ),
        raw_object_uri=str(request.output_path),
        raw_object_hash=raw_hash,
        source_version=f"ECMWF system {request.system}",
        ensemble_summary="mean of available ensemble members",
    )


def _monthly_polygon_values(
    dataset: xr.Dataset,
    *,
    lead_by_month: dict[date, int],
    geometry: dict,
) -> dict[date, float]:
    data = _temperature_array(dataset)
    latitude_name = _coordinate_name(data, "latitude", "lat")
    longitude_name = _coordinate_name(data, "longitude", "lon")
    lead_name = _coordinate_name(
        data,
        "forecastMonth",
        "forecast_month",
        "leadtime_month",
        required=False,
    )
    if lead_name is None and len(lead_by_month) != 1:
        raise ValueError("C3S_LEAD_COORDINATE_NOT_FOUND")

    latitude = data[latitude_name]
    longitude = data[longitude_name]
    lon_grid, lat_grid = np.meshgrid(longitude.values, latitude.values)
    mask = contains_xy(shape(geometry), lon_grid, lat_grid)
    if not bool(mask.any()):
        raise ValueError("C3S_POLYGON_HAS_NO_GRID_CELLS")
    mask_array = xr.DataArray(
        mask,
        coords={latitude_name: latitude, longitude_name: longitude},
        dims=(latitude_name, longitude_name),
    )
    weights = xr.DataArray(
        np.cos(np.deg2rad(latitude.values)).clip(min=0),
        coords={latitude_name: latitude},
        dims=(latitude_name,),
        name="weights",
    )

    values: dict[date, float] = {}
    for target, lead in lead_by_month.items():
        selected = data.sel({lead_name: lead}) if lead_name else data
        other_dimensions = [
            name
            for name in selected.dims
            if name not in {latitude_name, longitude_name}
        ]
        if other_dimensions:
            selected = selected.mean(dim=other_dimensions, skipna=True)
        value = (
            selected.where(mask_array)
            .weighted(weights)
            .mean(dim=(latitude_name, longitude_name), skipna=True)
        )
        number = float(value.item())
        values[target] = _to_celsius(number, data.attrs.get("units"))
    return values


def _open_download(path: Path) -> xr.Dataset:
    if zipfile.is_zipfile(path):
        extract_dir = path.with_name(f".{path.stem}.{uuid.uuid4().hex}.extract")
        extract_dir.mkdir(parents=True)
        try:
            with zipfile.ZipFile(path) as archive:
                _safe_extract(archive, extract_dir)
            files = sorted(extract_dir.rglob("*.nc"))
            if not files:
                raise ValueError("C3S_NETCDF_NOT_FOUND_IN_DOWNLOAD")
            datasets = [xr.open_dataset(file) for file in files]
            combined = xr.combine_by_coords(datasets).load()
            for item in datasets:
                item.close()
            if not isinstance(combined, xr.Dataset):
                raise ValueError("C3S_DOWNLOAD_MUST_CONTAIN_A_DATASET")
            return combined
        finally:
            shutil.rmtree(extract_dir, ignore_errors=True)
    return xr.open_dataset(path)


def _temperature_array(dataset: xr.Dataset) -> xr.DataArray:
    candidates = [
        C3S_VARIABLE,
        "mx2t24",
        "maximum_2m_temperature_in_the_last_24_hours",
    ]
    for name in candidates:
        if name in dataset.data_vars:
            return dataset[name]
    if len(dataset.data_vars) == 1:
        return next(iter(dataset.data_vars.values()))
    raise ValueError("C3S_TEMPERATURE_VARIABLE_NOT_FOUND")


def _coordinate_name(
    data: xr.DataArray, *names: str, required: bool = True
) -> str | None:
    for name in names:
        if name in data.coords or name in data.dims:
            return name
    if required:
        raise ValueError(f"C3S_COORDINATE_NOT_FOUND: {', '.join(names)}")
    return None


def _month_distance(start: date, end: date) -> int:
    return (end.year - start.year) * 12 + end.month - start.month


def _previous_month(value: date) -> date:
    return (
        date(value.year - 1, 12, 1)
        if value.month == 1
        else date(value.year, value.month - 1, 1)
    )


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _to_celsius(value: float, raw_units: object) -> float:
    if not np.isfinite(value):
        raise ValueError("C3S_TEMPERATURE_NOT_FINITE")
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
    raise ValueError(f"C3S_TEMPERATURE_UNITS_UNSUPPORTED: {raw_units!r}")


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
        raise ValueError("C3S_ARCHIVE_SIZE_INVALID")
    if total_bytes > max(0, shutil.disk_usage(destination).free - reserve_bytes):
        raise ValueError("C3S_ARCHIVE_STORAGE_INSUFFICIENT")
    for member in members:
        target = (destination / member.filename).resolve()
        if root not in target.parents and target != root:
            raise ValueError("C3S_ARCHIVE_PATH_INVALID")
        if member.flag_bits & 0x1:
            raise ValueError("C3S_ARCHIVE_ENCRYPTED")
        if member.file_size and (
            member.compress_size == 0 or member.file_size / member.compress_size > 1000
        ):
            raise ValueError("C3S_ARCHIVE_COMPRESSION_INVALID")
    archive.extractall(destination)
