"""Register published outlook places without assigning a predictive model.

The index declares the hierarchy; GeoJSON supplies versioned boundaries. New
administrative levels are configuration rows, never schema changes. Existing
place IDs and paths stay stable so saved scopes and links continue to work.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

from shapely.geometry import shape
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from chart.shared.db.models import AdminUnit, AppGeography, CountryGeoConfig, Geography
from chart.shared.db.session import get_session_factory


def register_geographies(session: Session, publication: Path) -> int:
    """Upsert one publication atomically; caller owns the transaction."""
    index = json.loads((publication / "index.json").read_text())
    boundary_file = publication / "boundaries.json"
    boundary_bytes = boundary_file.read_bytes()
    document = json.loads(boundary_bytes)
    if document.get("type") != "FeatureCollection":
        raise ValueError("Expected a boundary FeatureCollection")
    boundaries = {}
    for feature in document["features"]:
        place_id = feature["properties"]["geography_id"]
        if place_id in boundaries:
            raise ValueError(f"Duplicate boundary: {place_id}")
        geometry = shape(feature["geometry"])
        if (
            geometry.is_empty
            or not geometry.is_valid
            or geometry.geom_type not in {"Polygon", "MultiPolygon"}
        ):
            raise ValueError(f"Invalid polygon: {place_id}")
        boundaries[place_id] = (feature, geometry.bounds)
    digest = hashlib.sha256(boundary_bytes).hexdigest()
    pending = dict(index)
    count = 0
    while pending:
        progressed = False
        for place_id, entry in list(pending.items()):
            parent_id = entry.get("parent_id")
            if parent_id in pending:
                continue
            parent = session.get(AppGeography, parent_id) if parent_id else None
            if parent_id and parent is None:
                raise ValueError(f"Missing parent {parent_id} for {place_id}")
            country_code = entry["country_code"]
            if parent and parent.country_code != country_code:
                raise ValueError(f"Cross-country parent for {place_id}")
            place = session.get(AppGeography, place_id)
            if place and (
                place.parent_id != parent_id or place.country_code != country_code
            ):
                raise ValueError(f"Existing hierarchy differs for {place_id}")
            level = place.level if place else entry["level"]
            label = entry.get("level_label", entry["level"].replace("_", " ").title())
            config = session.get(CountryGeoConfig, (country_code, level))
            if config is None:
                session.add(
                    CountryGeoConfig(
                        country_code=country_code,
                        level_key=level,
                        level_label=label,
                        enabled=True,
                    )
                )
                session.flush()
            if place is None:
                slug = re.sub(r"[^a-z0-9]+", "-", entry["place"].lower()).strip("-")
                path = entry.get("path") or (
                    f"{parent.path}/{level}/{slug}" if parent else f"/{slug}"
                )
                place = AppGeography(
                    id=place_id,
                    country_code=country_code,
                    level=level,
                    level_label=label,
                    name=entry["place"],
                    parent_id=parent_id,
                    path=path,
                    sort_order=0,
                )
                session.add(place)
                session.flush()
            if place_id in boundaries:
                feature, bounds = boundaries[place_id]
                properties = feature["properties"]
                admin = session.scalar(
                    select(AdminUnit).where(AdminUnit.app_geography_id == place_id)
                )
                if admin is None:
                    parent_admin = (
                        session.scalar(
                            select(AdminUnit).where(
                                AdminUnit.app_geography_id == parent_id
                            )
                        )
                        if parent_id
                        else None
                    )
                    if parent_admin:
                        group_id = parent_admin.geography_id
                    else:
                        group = session.scalar(
                            select(Geography).where(
                                Geography.slug == country_code.lower()
                            )
                        )
                        if group is None:
                            group = Geography(
                                slug=country_code.lower(),
                                country=country_code,
                                name=country_code,
                            )
                            session.add(group)
                            session.flush()
                        group_id = group.id
                    # Fixed-length stable code avoids colliding across levels.
                    code = hashlib.sha256(place_id.encode()).hexdigest()[:32]
                    admin = AdminUnit(
                        geography_id=group_id,
                        app_geography_id=place_id,
                        code=code,
                        name=entry["place"],
                        level=entry["level"],
                    )
                    session.add(admin)
                place.external_code = str(
                    properties.get("external_code") or place.external_code or place_id
                )
                admin.bbox_west, admin.bbox_south, admin.bbox_east, admin.bbox_north = (
                    bounds
                )
                admin.boundary_version = digest
                admin.boundary_provenance = {
                    "source": "modeller handover",
                    "sha256": digest,
                    "release": entry.get("release"),
                    "geography_id": place_id,
                }
                session.flush()
                geometry_json = json.dumps(feature["geometry"])
                if session.get_bind().dialect.name == "postgresql":
                    session.execute(
                        update(AdminUnit)
                        .where(AdminUnit.id == admin.id)
                        .values(
                            boundary=func.ST_Multi(
                                func.ST_SetSRID(
                                    func.ST_GeomFromGeoJSON(geometry_json), 4326
                                )
                            )
                        )
                    )
                    session.expire(admin, ["boundary"])
                else:
                    admin.boundary = geometry_json
            del pending[place_id]
            count += 1
            progressed = True
        if not progressed:
            raise ValueError("Publication geography hierarchy contains a cycle")
    session.flush()
    return count


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "publication",
        type=Path,
        help="Directory containing index.json and boundaries.json",
    )
    args = parser.parse_args()
    with get_session_factory()() as session, session.begin():
        count = register_geographies(session, args.publication)
    print(f"Registered {count} outlook places")


if __name__ == "__main__":
    main()
