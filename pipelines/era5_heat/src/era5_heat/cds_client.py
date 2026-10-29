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
from threading import Lock

import xarray as xr

DATASET = "reanalysis-era5-single-levels"
VARIABLE = "2m_temperature"
_NETCDF_VALIDATION_LOCK = Lock()

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
    if configured := os.environ.get("ERA5_CACHE_DIR"):
        return Path(configured).expanduser()
    return Path(__file__).resolve().parent.parent.parent / ".cache"


def _make_client():
    try:
        import cdsapi
    except ImportError as exc:
        raise RuntimeError("cdsapi is not installed; run `pip install cdsapi`") from exc

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
        # NetCDF/HDF5 native open/close calls are not thread-safe. Downloads
        # remain concurrent, but their cache validation must not overlap.
        with _NETCDF_VALIDATION_LOCK:
            with xr.open_dataset(path):
                pass
        return True
    except Exception as exc:  # corrupt cache file; ignore and re-download
        log.warning("cache file %s unreadable (%s); will re-download", path, exc)
        return False


def _covering_cache(
    cache_dir: Path, year: int, bbox: BBox, months: tuple[int, ...]
) -> Path | None:
    """Find a retained acquisition covering the complete requested extent/time."""
    candidates = []
    north, west, south, east = bbox
    for metadata in cache_dir.glob("*.json"):
        try:
            document = json.loads(metadata.read_text())
            request = document["request"]
            n, w, s, e = map(float, request["area"])
            if (
                document.get("dataset") != DATASET
                or request.get("variable") != VARIABLE
                or int(request["year"]) != year
                or not set(months).issubset({int(m) for m in request["month"]})
                or not (n >= north and w <= west and s <= south and e >= east)
            ):
                continue
            path = metadata.with_suffix(".nc")
            if path.is_file():
                candidates.append((path.stat().st_size, str(path), path))
        except (OSError, ValueError, KeyError, TypeError, AttributeError):
            continue
    for _, _, path in sorted(candidates):
        if _cached_path_ok(path):
            return path
    return None


def download_metadata(result: DownloadResult) -> dict:
    """Keep the actual raw acquisition identity when a smaller request reuses it."""
    path = result.path
    with path.open("rb") as stream:
        sha256 = hashlib.file_digest(stream, "sha256").hexdigest()
    metadata = {
        "year": result.year,
        "months": list(result.months),
        "cache_hit": result.cache_hit,
        "path": str(path),
        "sha256": sha256,
    }
    sidecar = path.with_suffix(".json")
    if sidecar.is_file():
        try:
            document = json.loads(sidecar.read_text())
            metadata["source_request"] = document.get("request")
            metadata["downloaded_at"] = document.get("downloaded_at")
        except (OSError, ValueError, AttributeError):
            log.warning("unreadable cache metadata: %s", sidecar)
    return metadata


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
    if not no_cache and not refresh:
        covering = _covering_cache(cache_dir, year, bbox, selected_months)
        if covering is not None:
            log.info(
                "reusing covering cache: year=%d months=%s path=%s",
                year,
                selected_months,
                covering,
            )
            return DownloadResult(year, selected_months, covering, True)

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
                no_cache=no_cache,
                refresh=refresh,
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
