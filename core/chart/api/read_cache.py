"""Cache published reads once per data version, and let browsers keep them.

The map and estimate reads (``/heat-outlook``, ``/vra`` reads, ``/geographies``)
are pure functions of stored data, yet each request rebuilt them - map
geometry included - every time. This middleware:

- keys each GET by path, query and caller (the Authorization header, or
  "public"), because reads are scoped to the caller's geographies, and for a
  signed-in caller by the access mark too, so a disabled or narrowed person
  is never served what their old access let them read;
- tags it with the **data version**: the newest climate run, stored
  prediction, active model, forecast and population files, and the deployed
  code. Anything that could change a response changes the version;
- answers ``If-None-Match`` for an unchanged version with 304 before any work,
  serves a kept copy when it has one, and otherwise builds once and keeps it;
- sends ``ETag`` and ``Cache-Control`` so the browser reuses its copy and only
  revalidates (one cheap 304) after a minute.
"""

from __future__ import annotations

import hashlib
import os
import threading
import time
from collections import OrderedDict
from pathlib import Path

from sqlalchemy import func, select
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from chart.access.principal import access_mark

CACHED_PREFIXES = ("/heat-outlook/", "/vra/", "/geographies")
#: Never cached: per-user or administrative reads.
EXCLUDED_PARTS = ("/coverage", "/template", "/runs", "/values")
MAX_ENTRIES = 600
#: How long a data version is trusted before it is read again. While a
#: backfill or scoring run writes new rows every few seconds, re-reading it on
#: every request would invalidate every copy at once; five minutes keeps the
#: cache useful during loads and shows new results within five minutes.
VERSION_SECONDS = 300.0
BROWSER_SECONDS = 60

_entries: OrderedDict[str, tuple[str, bytes, str]] = OrderedDict()
_lock = threading.Lock()
_version: tuple[float, str] = (0.0, "")


def _files_signature() -> str:
    root = os.getenv("MODEL_CACHE_DIR")
    parts = [os.getenv("CHART_IMAGE_TAG") or os.getenv("IMAGE_TAG") or ""]
    population = (
        Path(__file__).resolve().parents[1] / "population" / "worldpop_2025.json"
    )
    for path in (
        [population, *sorted(Path(root, "forecasts").glob("*.json"))]
        if root
        else [population]
    ):
        try:
            parts.append(f"{path.name}:{path.stat().st_mtime_ns}")
        except OSError:
            continue
    return "|".join(parts)


def data_version() -> str:
    """Changes whenever anything a cached read depends on changes."""
    global _version
    now = time.monotonic()
    if now - _version[0] < VERSION_SECONDS and _version[1]:
        return _version[1]
    from chart.shared.db.models import (
        ActiveModelAssignment,
        ClimateRun,
        PredictionResult,
        VraRun,
    )
    from chart.shared.db.session import get_session_factory

    try:
        with get_session_factory()() as session:
            marks = [
                session.scalar(select(func.max(ClimateRun.id))),
                session.scalar(select(func.max(PredictionResult.id))),
                session.scalar(select(func.max(PredictionResult.computed_at))),
                session.scalar(select(func.max(ActiveModelAssignment.activated_at))),
                session.scalar(select(func.max(VraRun.id))),
            ]
    except Exception:  # noqa: BLE001 - no version means no caching, never an error
        return ""
    version = hashlib.sha256(f"{marks}|{_files_signature()}".encode()).hexdigest()[:20]
    _version = (now, version)
    return version


def _cacheable(request: Request) -> bool:
    path = request.url.path
    return (
        request.method == "GET"
        and path.startswith(CACHED_PREFIXES)
        and not any(part in path for part in EXCLUDED_PARTS)
    )


class ReadCacheMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint):
        # Opt-in per deployment: the key trusts the Authorization header to
        # tell callers apart, which holds where tokens are verified (the
        # deployed API), not where a test swaps users behind one header.
        if os.getenv("CHART_READ_CACHE") != "1" or not _cacheable(request):
            return await call_next(request)
        version = data_version()
        if not version:
            return await call_next(request)
        caller = request.headers.get("authorization") or "public"
        mark = "" if caller == "public" else access_mark()
        key = hashlib.sha256(
            f"{request.url.path}?{request.url.query}|{caller}|{mark}".encode()
        ).hexdigest()
        etag = f'W/"{hashlib.sha256(f"{key}|{version}".encode()).hexdigest()[:24]}"'
        headers = {
            "ETag": etag,
            "Cache-Control": (
                f"{'public' if caller == 'public' else 'private'}, "
                f"max-age={BROWSER_SECONDS}, stale-while-revalidate=86400"
            ),
            "Vary": "Authorization",
        }
        if request.headers.get("if-none-match") == etag:
            return Response(status_code=304, headers=headers)
        with _lock:
            hit = _entries.get(key)
            if hit is not None and hit[0] == version:
                _entries.move_to_end(key)
                return Response(
                    content=hit[1],
                    media_type=hit[2],
                    headers={**headers, "X-Cache": "hit"},
                )
        response = await call_next(request)
        if response.status_code != 200:
            return response
        body = b"".join([chunk async for chunk in response.body_iterator])  # type: ignore[attr-defined]
        media_type = response.media_type or response.headers.get(
            "content-type", "application/json"
        )
        with _lock:
            _entries[key] = (version, body, media_type)
            _entries.move_to_end(key)
            while len(_entries) > MAX_ENTRIES:
                _entries.popitem(last=False)
        return Response(
            content=body, media_type=media_type, headers={**headers, "X-Cache": "miss"}
        )


def clear() -> None:
    """Forget every kept response (tests, or after a manual data fix)."""
    global _version
    with _lock:
        _entries.clear()
    _version = (0.0, "")
