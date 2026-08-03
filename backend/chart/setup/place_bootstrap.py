"""Idempotent place bootstrap driven by the model release manifest.

Onboarding calls this when a user completes setup, so that the exact
admin_units their deployed model covers are seeded from the model
config itself (rather than assumed by a static Makefile target).

The flow is a lightweight rewrite of :mod:`chart.bootstrap`:

    boundaries GeoJSON  ->  AdminUnit rows
    model release JSON  ->  ModelRelease + ModelAreaMapping rows
                         +  ActiveModelAssignment when ``activate`` is set

Everything is upsert-shaped, so calling this twice with the same
manifests + release is a no-op. Callers own the transaction, so a
failure at any step leaves the previous state intact.
"""

from __future__ import annotations

import json
import logging
import shutil
import ssl
import tempfile
import urllib.request
from dataclasses import dataclass
from pathlib import Path

import certifi

from sqlalchemy import select
from sqlalchemy.orm import Session

from chart.geographies.load import _ensure_mp_app_places, load_mp_model_area_geojson
from chart.model_registry.schemas import ModelReleaseSpec
from chart.model_registry.service import _activate_release, register_model_release
from chart.shared.db.models import AdminUnit, Geography

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PlaceBootstrapResult:
    """Summary of what the seed did, safe to return from an HTTP route."""

    areas_seeded: int
    model_release_id: str
    model_status: str


class PlaceBootstrapError(RuntimeError):
    """The manifest paths could not be resolved or downloaded."""


def bootstrap_place_from_release(
    session: Session,
    *,
    model_release_path: Path,
    activate: bool = True,
) -> PlaceBootstrapResult:
    """Zero-network seed: reads only the model release JSON.

    Upserts one AdminUnit per area in the release, links each to the
    matching AppGeography, then registers the release with an active
    assignment. Boundary polygons are left null: dashboards and
    predictions do not need them; run bootstrap_place_from_manifest
    only when you actually want spatial features.
    """

    logger.warning("bootstrap_from_release: reading %s", model_release_path)
    spec = ModelReleaseSpec.model_validate(
        json.loads(model_release_path.read_text(encoding="utf-8"))
    )
    logger.info(
        "bootstrap_from_release: parsed release %s with %d areas",
        spec.id,
        len(spec.areas),
    )

    geography = session.scalar(
        select(Geography).where(Geography.slug == "madhya-pradesh")
    )
    if geography is None:
        geography = Geography(
            slug="madhya-pradesh", country="India", name="Madhya Pradesh"
        )
        session.add(geography)
        session.flush()
        logger.warning("bootstrap_from_release: created chart_geographies row for MP")

    app_places = _ensure_mp_app_places(session)
    logger.info(
        "bootstrap_from_release: %d AppGeography rows present",
        len(app_places),
    )

    upserted = 0
    for area in spec.areas:
        admin_unit = session.scalar(
            select(AdminUnit).where(
                AdminUnit.geography_id == geography.id,
                AdminUnit.code == area.place_code,
            )
        )
        if admin_unit is None:
            admin_unit = AdminUnit(
                geography_id=geography.id,
                code=area.place_code,
                name=area.model_area_name,
                level=area.level or "state",
            )
            session.add(admin_unit)
        admin_unit.name = area.model_area_name
        if area.level:
            admin_unit.level = area.level
        linked = app_places.get(area.model_area_name)
        if linked is not None:
            admin_unit.app_geography_id = linked.id
        upserted += 1
    session.flush()
    logger.warning("bootstrap_from_release: upserted %d admin_units", upserted)

    # register_model_release adds ModelAreaMapping rows but the production
    # session factory runs with autoflush=False, so its own _activate_release
    # call would query an empty table. Register first, flush the mappings,
    # then activate explicitly.
    release = register_model_release(session, spec, activate=False)
    session.flush()
    if activate:
        _activate_release(session, release)
        session.flush()
    logger.info(
        "bootstrap_from_release: registered %s (status=%s)",
        release.id,
        release.status,
    )

    return PlaceBootstrapResult(
        areas_seeded=len(spec.areas),
        model_release_id=release.id,
        model_status=release.status,
    )


def bootstrap_place_from_manifest(
    session: Session,
    *,
    source_manifest_path: Path,
    crosswalk_path: Path,
    model_release_path: Path,
    activate: bool = True,
) -> PlaceBootstrapResult:
    """Seed the admin_units + model for one place, from local file paths.

    ``source_manifest_path`` describes the two boundary GeoJSON URLs;
    ``crosswalk_path`` maps district codes to division names; both are
    already vendored in ``pipelines/boundaries/`` at HEAD. The
    ``model_release_path`` is the release manifest whose ``areas`` list
    is the source of truth for which admin_units get created.
    """

    manifest = json.loads(source_manifest_path.read_text(encoding="utf-8"))

    from chart_boundaries.mp_model_areas import (
        build_mp_model_areas,
        write_build_outputs,
    )

    with tempfile.TemporaryDirectory(prefix="chart-place-bootstrap-") as temp:
        temp_dir = Path(temp)
        adm1 = temp_dir / "adm1.geojson"
        adm2 = temp_dir / "adm2.geojson"
        _download(manifest["sources"]["adm1_validation"]["uri"], adm1)
        _download(manifest["sources"]["adm2_boundaries"]["uri"], adm2)

        output = temp_dir / "mp-model-areas.geojson"
        build_manifest = temp_dir / "mp-model-areas.build.json"
        areas = build_mp_model_areas(
            adm1_path=adm1,
            adm2_path=adm2,
            crosswalk_path=crosswalk_path,
            source_manifest_path=source_manifest_path,
        )
        write_build_outputs(
            areas,
            output_path=output,
            build_manifest_path=build_manifest,
            source_manifest_path=source_manifest_path,
            crosswalk_path=crosswalk_path,
        )

        spec = ModelReleaseSpec.model_validate(
            json.loads(model_release_path.read_text(encoding="utf-8"))
        )
        loaded = load_mp_model_area_geojson(session, output)
        release = register_model_release(session, spec, activate=activate)
        return PlaceBootstrapResult(
            areas_seeded=len(loaded),
            model_release_id=release.id,
            model_status=release.status,
        )


def _download(url: str, destination: Path) -> None:
    context = ssl.create_default_context(cafile=certifi.where())
    request = urllib.request.Request(url, headers={"User-Agent": "CHART/0.1"})
    try:
        with urllib.request.urlopen(request, context=context, timeout=60) as response:
            with destination.open("wb") as output:
                shutil.copyfileobj(response, output)
    except (OSError, ValueError) as exc:
        raise PlaceBootstrapError(f"boundary_download_failed: {url}") from exc
