from __future__ import annotations

import json
import math
import re
from pathlib import Path
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from chart.shared.db.models import (
    AdminUnit,
    AppGeography,
    CountryGeoConfig,
    Geography,
)

from .catalog import MP_LBW_MODEL_AREAS
from .schemas import BoundaryRegistryError

_SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")


def load_release_geography_geojson(
    session: Session,
    geojson_path: Path,
    release_spec: Any,
    release_geography: Any | None = None,
) -> dict[str, AdminUnit]:
    """Load an installation geography declared entirely by a release manifest."""

    release_geography = release_geography or release_spec.geography
    if release_geography is None:
        raise BoundaryRegistryError(
            "BOUNDARY_RELEASE_GEOGRAPHY_REQUIRED", release_spec.id
        )

    document = json.loads(geojson_path.read_text(encoding="utf-8"))
    features = document.get("features")
    if document.get("type") != "FeatureCollection" or not isinstance(features, list):
        raise BoundaryRegistryError(
            "BOUNDARY_GEOJSON_INVALID", "expected a GeoJSON FeatureCollection"
        )
    indexed = {
        feature.get("properties", {}).get("admin_unit_code"): feature
        for feature in features
    }
    places_by_code = {place.place_code: place for place in release_geography.places}
    expected_boundary_keys = {place.boundary_key for place in release_geography.places}
    missing_boundary_keys = expected_boundary_keys - set(indexed)
    if missing_boundary_keys:
        raise BoundaryRegistryError(
            "BOUNDARY_MODEL_AREA_SET_MISMATCH",
            f"missing={sorted(missing_boundary_keys)}; actual={sorted(indexed)}",
        )

    geography_slug = release_geography.analytics_slug
    geography = session.scalar(
        select(Geography).where(Geography.slug == geography_slug)
    )
    if geography is None:
        geography = Geography(
            slug=geography_slug,
            country=release_geography.country_name,
            name=release_geography.country_name,
        )
        session.add(geography)
        session.flush()
    app_places = _ensure_release_app_places(session, release_geography)

    loaded: dict[str, AdminUnit] = {}
    for place_code, area in places_by_code.items():
        feature = indexed[area.boundary_key]
        properties = feature.get("properties", {})
        geometry = feature.get("geometry")
        if properties.get("geography_level") != area.level:
            raise BoundaryRegistryError(
                "BOUNDARY_MODEL_AREA_LEVEL_MISMATCH", place_code
            )
        if not isinstance(geometry, dict) or geometry.get("type") not in {
            "Polygon",
            "MultiPolygon",
        }:
            raise BoundaryRegistryError("BOUNDARY_GEOMETRY_TYPE_INVALID", place_code)
        source_hash = properties.get("source_artifact_sha256", "")
        if not _SHA256_PATTERN.fullmatch(source_hash):
            raise BoundaryRegistryError("BOUNDARY_CHECKSUM_INVALID", place_code)

        admin_unit = session.scalar(
            select(AdminUnit).where(
                AdminUnit.geography_id == geography.id,
                AdminUnit.code == place_code,
            )
        )
        if admin_unit is None:
            admin_unit = AdminUnit(
                geography_id=geography.id,
                code=place_code,
                name=area.display_name,
                level=area.level,
            )
            session.add(admin_unit)
        west, south, east, north = _geometry_bounds(geometry)
        admin_unit.name = area.display_name
        admin_unit.level = area.level
        admin_unit.bbox_north = north
        admin_unit.bbox_west = west
        admin_unit.bbox_south = south
        admin_unit.bbox_east = east
        admin_unit.boundary_provenance = {
            "source_dataset": properties.get("source_dataset"),
            "source_artifact_sha256": source_hash,
            "transform_id": properties.get("transform_id"),
        }
        admin_unit.boundary_version = f"{properties.get('transform_id')}:{source_hash}"
        admin_unit.app_geography_id = app_places[place_code].id
        model_mapping = next(
            (
                mapping
                for mapping in release_spec.areas
                if mapping.place_code == place_code
            ),
            None,
        )
        admin_unit.note = (
            f"Administrative climate-extraction boundary mapped to the "
            f"{model_mapping.model_area_name} model area by release {release_spec.id}."
            if model_mapping is not None
            else f"Navigation geography declared by release {release_spec.id}; "
            "no fitted model block is assigned."
        )
        session.flush()
        geometry_json = json.dumps(geometry, sort_keys=True, separators=(",", ":"))
        if session.get_bind().dialect.name == "postgresql":
            session.execute(
                update(AdminUnit)
                .where(AdminUnit.id == admin_unit.id)
                .values(
                    boundary=func.ST_Multi(
                        func.ST_SetSRID(func.ST_GeomFromGeoJSON(geometry_json), 4326)
                    )
                )
            )
            session.expire(admin_unit, ["boundary"])
        else:
            admin_unit.boundary = geometry_json
        loaded[place_code] = admin_unit
    session.flush()
    return loaded


def _ensure_release_app_places(
    session: Session, geography: Any
) -> dict[str, AppGeography]:
    country_config = session.get(CountryGeoConfig, (geography.country_code, "country"))
    if country_config is None:
        session.add(
            CountryGeoConfig(
                country_code=geography.country_code,
                level_key="country",
                level_label="Country",
                enabled=True,
                sort_order=0,
            )
        )
    for level in geography.levels:
        config = session.get(CountryGeoConfig, (geography.country_code, level.key))
        if config is None:
            session.add(
                CountryGeoConfig(
                    country_code=geography.country_code,
                    level_key=level.key,
                    level_label=level.label,
                    enabled=True,
                    sort_order=level.sort_order,
                )
            )
    session.flush()
    country = _upsert_app_place(
        session,
        place_id=geography.root_id,
        country_code=geography.country_code,
        level="country",
        level_label="Country",
        name=geography.country_name,
        parent_id=None,
        path=geography.root_path,
        sort_order=0,
    )
    places: dict[str, AppGeography] = {}
    pending = list(geography.places)
    while pending:
        progressed = False
        for area in pending[:]:
            parent = (
                places.get(area.parent_place_code)
                if area.parent_place_code
                else country
            )
            if parent is None:
                continue
            places[area.place_code] = _upsert_app_place(
                session,
                place_id=area.geography_id,
                country_code=geography.country_code,
                level=area.app_level,
                level_label=area.level_label,
                name=area.display_name,
                parent_id=parent.id,
                path=area.path,
                sort_order=area.sort_order,
            )
            pending.remove(area)
            progressed = True
        if not progressed:
            raise BoundaryRegistryError(
                "BOUNDARY_RELEASE_GEOGRAPHY_PARENT_CYCLE", geography.root_id
            )
    session.flush()
    return places


def load_mp_model_area_geojson(
    session: Session, geojson_path: Path
) -> dict[str, AdminUnit]:
    """Load the exact MP LBW state/division polygons into the geographic spine."""

    document = json.loads(geojson_path.read_text(encoding="utf-8"))
    features = document.get("features")
    if document.get("type") != "FeatureCollection" or not isinstance(features, list):
        raise BoundaryRegistryError(
            "BOUNDARY_GEOJSON_INVALID", "expected a GeoJSON FeatureCollection"
        )

    indexed: dict[str, dict] = {}
    for feature in features:
        properties = feature.get("properties", {})
        area_name = properties.get("area_name")
        if not isinstance(area_name, str) or not area_name:
            raise BoundaryRegistryError(
                "BOUNDARY_AREA_NAME_REQUIRED", "feature has no area_name"
            )
        if area_name in indexed:
            raise BoundaryRegistryError("BOUNDARY_AREA_DUPLICATE", area_name)
        indexed[area_name] = feature

    expected = set(MP_LBW_MODEL_AREAS)
    actual = set(indexed)
    if actual != expected:
        raise BoundaryRegistryError(
            "BOUNDARY_MODEL_AREA_SET_MISMATCH",
            f"missing={sorted(expected - actual)}; unexpected={sorted(actual - expected)}",
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

    app_places = _ensure_mp_app_places(session)

    loaded: dict[str, AdminUnit] = {}
    shared_provenance: dict | None = None
    for area_name in MP_LBW_MODEL_AREAS:
        feature = indexed[area_name]
        properties = feature["properties"]
        geometry = feature.get("geometry")
        geometry = _validate_feature(area_name, properties, geometry)
        provenance = _feature_provenance(properties)
        if shared_provenance is None:
            shared_provenance = provenance
        elif provenance != shared_provenance:
            raise BoundaryRegistryError(
                "BOUNDARY_PROVENANCE_MISMATCH",
                f"{area_name} does not share the selected source and transform",
            )

        code = properties["admin_unit_code"]
        admin_unit = session.scalar(
            select(AdminUnit).where(
                AdminUnit.geography_id == geography.id,
                AdminUnit.code == code,
            )
        )
        if admin_unit is None:
            admin_unit = AdminUnit(
                geography_id=geography.id,
                code=code,
                name=area_name,
                level=properties["geography_level"],
            )
            session.add(admin_unit)

        west, south, east, north = _geometry_bounds(geometry)
        admin_unit.name = area_name
        admin_unit.level = properties["geography_level"]
        admin_unit.bbox_north = north
        admin_unit.bbox_west = west
        admin_unit.bbox_south = south
        admin_unit.bbox_east = east
        admin_unit.boundary_provenance = provenance
        admin_unit.boundary_version = (
            f"{properties['transform_id']}:{properties['boundary_artifact_sha256']}"
        )
        admin_unit.app_geography_id = app_places[area_name].id
        admin_unit.note = (
            "Model-aligned MP administrative polygon; do not replace with a bbox."
        )
        session.flush()

        geometry_json = json.dumps(geometry, sort_keys=True, separators=(",", ":"))
        if session.get_bind().dialect.name == "postgresql":
            session.execute(
                update(AdminUnit)
                .where(AdminUnit.id == admin_unit.id)
                .values(
                    boundary=func.ST_Multi(
                        func.ST_SetSRID(func.ST_GeomFromGeoJSON(geometry_json), 4326)
                    )
                )
            )
            session.expire(admin_unit, ["boundary"])
        else:
            admin_unit.boundary = geometry_json
        loaded[area_name] = admin_unit

    session.flush()
    return loaded


def _ensure_mp_app_places(session: Session) -> dict[str, AppGeography]:
    """Create the user-selectable state/division records used by the model mapping."""

    for level_key, label, sort_order in (
        ("country", "Country", 0),
        ("geo_level_1", "State", 1),
        ("geo_level_2", "District", 2),
    ):
        config = session.get(CountryGeoConfig, ("IN", level_key))
        if config is None:
            session.add(
                CountryGeoConfig(
                    country_code="IN",
                    level_key=level_key,
                    level_label=label,
                    enabled=True,
                    sort_order=sort_order,
                )
            )
    session.flush()

    country = _upsert_app_place(
        session,
        place_id="geo-in",
        country_code="IN",
        level="country",
        level_label="Country",
        name="India",
        parent_id=None,
        path="/india",
        sort_order=0,
    )
    state = _upsert_app_place(
        session,
        place_id="geo-in-madhya-pradesh",
        country_code="IN",
        level="geo_level_1",
        level_label="State",
        name="Madhya Pradesh",
        parent_id=country.id,
        path="/india/madhya-pradesh",
        sort_order=0,
    )

    places = {"Madhya Pradesh": state}
    for sort_order, area_name in enumerate(MP_LBW_MODEL_AREAS[1:], start=1):
        code = _slug(area_name)
        places[area_name] = _upsert_app_place(
            session,
            place_id=f"geo-in-madhya-pradesh-division-{code}",
            country_code="IN",
            level="geo_level_2",
            level_label="Division",
            name=f"{area_name} Division",
            parent_id=state.id,
            path=f"/india/madhya-pradesh/divisions/{code}",
            sort_order=sort_order,
        )
    session.flush()
    return places


def _upsert_app_place(
    session: Session,
    *,
    place_id: str,
    country_code: str,
    level: str,
    level_label: str,
    name: str,
    parent_id: str | None,
    path: str,
    sort_order: int,
) -> AppGeography:
    place = session.get(AppGeography, place_id)
    if place is None:
        place = AppGeography(id=place_id)
        session.add(place)
    place.country_code = country_code
    place.level = level
    place.level_label = level_label
    place.name = name
    place.parent_id = parent_id
    place.path = path
    place.sort_order = sort_order
    return place


def _validate_feature(area_name: str, properties: dict, geometry: dict | None) -> dict:
    expected_level = "state" if area_name == "Madhya Pradesh" else "division"
    if properties.get("geography_level") != expected_level:
        raise BoundaryRegistryError("BOUNDARY_MODEL_AREA_LEVEL_MISMATCH", area_name)
    if properties.get("country_code") != "IND":
        raise BoundaryRegistryError("BOUNDARY_COUNTRY_MISMATCH", area_name)
    expected_code = _slug(area_name)
    if properties.get("admin_unit_code") != expected_code:
        raise BoundaryRegistryError("BOUNDARY_ADMIN_UNIT_CODE_MISMATCH", area_name)
    if not isinstance(geometry, dict) or geometry.get("type") != "MultiPolygon":
        raise BoundaryRegistryError(
            "BOUNDARY_GEOMETRY_TYPE_INVALID", f"{area_name} must be MultiPolygon"
        )
    artifact_hash = properties.get("boundary_artifact_sha256", "")
    if not _SHA256_PATTERN.fullmatch(artifact_hash):
        raise BoundaryRegistryError("BOUNDARY_CHECKSUM_INVALID", area_name)
    for key in (
        "boundary_source_key",
        "boundary_source_version",
        "boundary_license",
        "crosswalk_source_url",
        "crosswalk_snapshot_date",
        "transform_id",
    ):
        if not str(properties.get(key, "")).strip():
            raise BoundaryRegistryError(
                "BOUNDARY_PROVENANCE_REQUIRED", f"{area_name}: {key}"
            )
    return geometry


def _feature_provenance(properties: dict) -> dict:
    return {
        "country_code": "IND",
        "source_key": properties["boundary_source_key"],
        "source_version": properties["boundary_source_version"],
        "artifact_sha256": properties["boundary_artifact_sha256"],
        "license": properties["boundary_license"],
        "crosswalk_source_url": properties["crosswalk_source_url"],
        "crosswalk_snapshot_date": properties["crosswalk_snapshot_date"],
        "transform_id": properties["transform_id"],
    }


def _geometry_bounds(geometry: dict) -> tuple[float, float, float, float]:
    positions = list(_positions(geometry.get("coordinates")))
    if not positions:
        raise BoundaryRegistryError("BOUNDARY_GEOMETRY_EMPTY", "no coordinates")
    xs = [position[0] for position in positions]
    ys = [position[1] for position in positions]
    bounds = min(xs), min(ys), max(xs), max(ys)
    if not all(math.isfinite(value) for value in bounds):
        raise BoundaryRegistryError("BOUNDARY_GEOMETRY_INVALID", "non-finite bounds")
    west, south, east, north = bounds
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise BoundaryRegistryError("BOUNDARY_GEOMETRY_INVALID", str(bounds))
    return bounds


def _positions(value):
    if (
        isinstance(value, list)
        and len(value) >= 2
        and isinstance(value[0], (int, float))
        and isinstance(value[1], (int, float))
    ):
        yield float(value[0]), float(value[1])
        return
    if isinstance(value, list):
        for child in value:
            yield from _positions(child)


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
