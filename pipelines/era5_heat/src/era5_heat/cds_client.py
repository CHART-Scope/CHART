"""Copernicus CDS client: build, cache, and download ERA5 NetCDFs."""

from __future__ import annotations

import hashlib
import json
import logging
import os
import secrets
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import xarray as xr

DATASET = "reanalysis-era5-single-levels"
VARIABLE = "2m_temperature"

log = logging.getLogger(__name__)

BBox = tuple[float, float, float, float]  # (north, west, south, east)


def validate_bbox(bbox: BBox) -> None:
    n, w, s, e = bbox
    if not (n > s):
        raise ValueError(f"bbox north ({n}) must be > south ({s})")
    if not (-90 <= s and n <= 90):
        raise ValueError(f"bbox lat out of range: north={n}, south={s}")
    if not (-180 <= w < e <= 180):
        raise ValueError(
            f"bbox lon must satisfy -180 <= west ({w}) < east ({e}) <= 180; "
            "antimeridian-crossing bboxes are not supported"
        )


def _normalize_months(months: tuple[int, ...] | None) -> tuple[int, ...]:
    selected = months or tuple(range(1, 13))
    if not selected or any(month < 1 or month > 12 for month in selected):
        raise ValueError("months must contain values from 1 to 12")
    return tuple(sorted(set(selected)))


def build_request(
    year: int,
    bbox: BBox,
    months: tuple[int, ...] | None = None,
) -> dict:
    validate_bbox(bbox)
    n, w, s, e = bbox
    selected_months = _normalize_months(months)
    return {
        "product_type": "reanalysis",
        "variable": VARIABLE,
        "year": str(year),
        "month": [f"{month:02d}" for month in selected_months],
        "day": [f"{d:02d}" for d in range(1, 32)],
        "time": [f"{h:02d}:00" for h in range(24)],
        "area": [n, w, s, e],
        "format": "netcdf",
        "download_format": "unarchived",
    }


def cache_key(
    year: int,
    bbox: BBox,
    months: tuple[int, ...] | None = None,
) -> str:
    payload = {
        "dataset": DATASET,
        "variable": VARIABLE,
        "year": year,
        "months": list(_normalize_months(months)),
        "area": list(bbox),
    }
    blob = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(blob).hexdigest()[:16]


@dataclass
class DownloadResult:
    year: int
    months: tuple[int, ...]
    path: Path
    cache_hit: bool


def _default_cache_dir() -> Path:
    return Path(__file__).resolve().parent.parent.parent / ".cache"


def _make_client():
    try:
        import cdsapi
    except ImportError as exc:
        raise RuntimeError(
            "cdsapi is not installed; run `pip install cdsapi`"
        ) from exc

    url = os.environ.get("CDSAPI_URL")
    key = os.environ.get("CDSAPI_KEY")
    if url and key:
        return cdsapi.Client(url=url, key=key, quiet=True)

    rc = Path.home() / ".cdsapirc"
    if not rc.exists():
        raise RuntimeError(
            "No CDS credentials found. Either set CDSAPI_URL and CDSAPI_KEY "
            "env vars, or create ~/.cdsapirc. See "
            "https://cds.climate.copernicus.eu/how-to-api"
        )
    return cdsapi.Client(quiet=True)


def _cached_path_ok(path: Path) -> bool:
    if not path.exists() or path.stat().st_size == 0:
        return False
    try:
        with xr.open_dataset(path) as _:
            pass
        return True
    except Exception as exc:  # corrupt cache file; ignore and re-download
        log.warning("cache file %s unreadable (%s); will re-download", path, exc)
        return False


def download_year(
    year: int,
    bbox: BBox,
    cache_dir: Path | None = None,
    *,
    months: tuple[int, ...] | None = None,
    no_cache: bool = False,
    refresh: bool = False,
) -> DownloadResult:
    cache_dir = cache_dir or _default_cache_dir()
    cache_dir.mkdir(parents=True, exist_ok=True)

    selected_months = _normalize_months(months)
    key = cache_key(year, bbox, selected_months)
    nc_path = cache_dir / f"{key}.nc"
    meta_path = cache_dir / f"{key}.json"

    if not no_cache and not refresh and _cached_path_ok(nc_path):
        log.info("cache hit: year=%d months=%s key=%s", year, selected_months, key)
        return DownloadResult(
            year=year,
            months=selected_months,
            path=nc_path,
            cache_hit=True,
        )

    request = build_request(year, bbox, selected_months)
    client = _make_client()

    partial = nc_path.with_name(f".{nc_path.name}.{secrets.token_hex(8)}.partial")
    log.info(
        "CDS request: year=%d months=%s key=%s area=%s",
        year,
        selected_months,
        key,
        request["area"],
    )
    try:
        client.retrieve(DATASET, request, str(partial))
        if not _cached_path_ok(partial):
            raise RuntimeError("CDS_DOWNLOAD_INVALID")
        os.replace(partial, nc_path)
    finally:
        partial.unlink(missing_ok=True)

    if not no_cache:
        import cdsapi  # for version stamp
        _atomic_write_text(
            meta_path,
            json.dumps(
                {
                    "dataset": DATASET,
                    "request": request,
                    "downloaded_at": datetime.now(timezone.utc).isoformat(),
                    "cdsapi_version": getattr(cdsapi, "__version__", "unknown"),
                },
                indent=2,
            )
            + "\n",
        )

    return DownloadResult(
        year=year,
        months=selected_months,
        path=nc_path,
        cache_hit=False,
    )


def download_years(
    years: list[int],
    bbox: BBox,
    cache_dir: Path | None = None,
    *,
    months_by_year: dict[int, tuple[int, ...]] | None = None,
    no_cache: bool = False,
    refresh: bool = False,
    max_workers: int = 3,
) -> list[DownloadResult]:
    """Download many years concurrently. Order in result matches input order."""
    by_year: dict[int, DownloadResult] = {}
    with ThreadPoolExecutor(max_workers=max_workers) as ex:
        futures = {
            ex.submit(
                download_year,
                y,
                bbox,
                cache_dir,
                months=(months_by_year or {}).get(y),
                no_cache=no_cache, refresh=refresh,
            ): y
            for y in years
        }
        for fut in as_completed(futures):
            res = fut.result()
            by_year[res.year] = res
    return [by_year[y] for y in years]


def _atomic_write_text(path: Path, value: str) -> None:
    temporary = path.with_name(f".{path.name}.{secrets.token_hex(8)}.partial")
    try:
        temporary.write_text(value, encoding="utf-8")
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)
