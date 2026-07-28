from __future__ import annotations

import json
import logging
import os
import re
import threading
import time
import urllib.parse
import urllib.error
import urllib.request
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, Query

router = APIRouter(prefix="/solutions", tags=["solution-repository"])
REPO_ROOT = Path(__file__).resolve().parents[3]
logger = logging.getLogger(__name__)
_remote_lock = threading.Lock()
_remote_cache: dict[str, tuple[float, object]] = {}
_remote_failures = 0
_remote_open_until = 0.0


@router.get("")
def list_solutions(
    hazard: str | None = None,
    solutionType: str | None = None,
    cost: str | None = None,
    search: str | None = None,
    status: str | None = None,
    limit: int = Query(default=100, ge=1, le=100),
):
    remote = _remote("api/public/solutions", locals())
    if remote is not None:
        return remote
    items = _snapshot()["items"]
    if hazard:
        items = [item for item in items if _has_taxonomy(item, "hazard", hazard)]
    if solutionType:
        items = [
            item for item in items if _has_taxonomy(item, "solution_type", solutionType)
        ]
    if cost:
        items = [item for item in items if item["costOfImplementation"] == cost]
    if search:
        needle = search.casefold()
        items = [
            item
            for item in items
            if needle in f"{item['name']} {item['description']}".casefold()
        ]
    if status:
        items = [item for item in items if item["status"] == status]
    return {"items": items[:limit], "total": len(items)}


@router.get("/taxonomies")
def list_taxonomies():
    remote = _remote("api/public/solutions/taxonomies")
    return remote if remote is not None else _snapshot()["taxonomies"]


@lru_cache(maxsize=1)
def _snapshot() -> dict:
    path = REPO_ROOT / "api/src/services/chart-repository/seed-data/seed.json"
    seed = json.loads(path.read_text(encoding="utf-8"))
    items = []
    taxonomy_map = {}
    for source in seed.get("items", []):
        taxonomies = []
        for kind, values in (
            ("hazard", source.get("climateHazards", [])),
            ("solution_type", source.get("solutionTypes", [])),
        ):
            for label in values:
                taxonomy = {
                    "id": f"{kind.replace('_', '-')}-{_slug(label)}",
                    "type": kind,
                    "label": label,
                }
                taxonomy_map[taxonomy["id"]] = taxonomy
                taxonomies.append(taxonomy)
        links = [
            {"label": _link_label(url), "url": url}
            for url in source.get("usefulLinks", [])
        ]
        assets = [
            {
                "id": f"asset-{_slug(item.get('filename', str(index)))}",
                "kind": "case_study",
                "filename": item.get("filename", "Case study"),
                "mimeType": item.get("type"),
                "sizeBytes": item.get("size"),
                "storageUrl": item.get("url"),
                "attribution": item.get("attribution"),
            }
            for index, item in enumerate(source.get("caseStudies", []))
        ]
        items.append(
            {
                "id": f"solution-{source['slug']}",
                "slug": source["slug"],
                "name": source["title"],
                "summary": source["description"].split("\n", 1)[0],
                "description": source["description"],
                "implementationNotes": None,
                "costOfImplementation": source.get("costOfImplementation"),
                "maintenanceRequirement": None,
                "timeToImplement": None,
                "evidenceLevel": None,
                "sourceId": seed.get("sourceId", "chart-repository"),
                "sourceRecordId": source.get("sourceRecordId"),
                "sourceVersion": str(seed.get("version", 1)),
                "sourceUpdatedAt": source.get("sourceUpdatedAt"),
                "license": source.get("license", seed.get("license")),
                "attribution": source.get("attribution", seed.get("attribution")),
                "status": "published",
                "taxonomies": taxonomies,
                "links": links,
                "assets": assets,
            }
        )
    return {
        "items": items,
        "taxonomies": sorted(taxonomy_map.values(), key=lambda item: item["label"]),
    }


def _remote(path: str, query: dict | None = None):
    global _remote_failures, _remote_open_until

    base = os.getenv("CHART_REPOSITORY_URL", "").strip().rstrip("/")
    if not base:
        return None
    values = {
        key: value
        for key, value in (query or {}).items()
        if value is not None and key not in {"remote"}
    }
    suffix = f"?{urllib.parse.urlencode(values)}" if values else ""
    url = f"{base}/{path}{suffix}"
    now = time.monotonic()
    ttl = float(os.getenv("CHART_REPOSITORY_CACHE_SECONDS", "300"))
    with _remote_lock:
        cached = _remote_cache.get(url)
        if cached is not None and now - cached[0] <= ttl:
            return cached[1]
        if now < _remote_open_until:
            return cached[1] if cached is not None else None

    try:
        request = urllib.request.Request(url, headers={"User-Agent": "CHART/0.2"})
        with urllib.request.urlopen(
            request,
            timeout=float(os.getenv("CHART_REPOSITORY_TIMEOUT_SECONDS", "3")),
        ) as response:
            max_bytes = int(
                os.getenv("CHART_REPOSITORY_MAX_RESPONSE_BYTES", str(5 * 1024 * 1024))
            )
            declared_size = response.headers.get("Content-Length")
            if declared_size is not None and int(declared_size) > max_bytes:
                raise ValueError("repository response exceeds configured limit")
            body = response.read(max_bytes + 1)
            if len(body) > max_bytes:
                raise ValueError("repository response exceeds configured limit")
            payload = json.loads(body)
        if not isinstance(payload, (dict, list)):
            raise ValueError("repository response must be JSON object or array")
    except (
        OSError,
        ValueError,
        json.JSONDecodeError,
        urllib.error.HTTPError,
    ):
        with _remote_lock:
            _remote_failures += 1
            threshold = int(os.getenv("CHART_REPOSITORY_CIRCUIT_FAILURES", "3"))
            if _remote_failures >= threshold:
                _remote_open_until = now + float(
                    os.getenv("CHART_REPOSITORY_CIRCUIT_SECONDS", "30")
                )
            cached = _remote_cache.get(url)
        logger.exception(
            "Solution repository unavailable; serving last-known-good snapshot"
        )
        return cached[1] if cached is not None else None

    with _remote_lock:
        _remote_cache[url] = (now, payload)
        _remote_failures = 0
        _remote_open_until = 0.0
    return payload


def _has_taxonomy(item, kind, value):
    return any(
        taxonomy["type"] == kind
        and value.casefold()
        in {taxonomy["id"].casefold(), taxonomy["label"].casefold()}
        for taxonomy in item["taxonomies"]
    )


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def _link_label(url: str) -> str:
    return urllib.parse.urlparse(url).netloc or "Useful link"
