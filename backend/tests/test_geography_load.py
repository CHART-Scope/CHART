from __future__ import annotations

import json
from pathlib import Path

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker

from chart.geographies.catalog import MP_LBW_MODEL_AREAS
from chart.geographies.load import load_mp_model_area_geojson
from chart.geographies.schemas import BoundaryRegistryError
from chart.shared.db.base import Base
from chart.shared.db.models import AdminUnit


@pytest.fixture
def session() -> Session:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as db_session:
        yield db_session


def _feature(area_name: str, index: int) -> dict:
    west = 74.0 + index * 0.1
    south = 21.0 + index * 0.1
    properties = {
        "area_name": area_name,
        "admin_unit_code": area_name.lower().replace(" ", "-"),
        "geography_level": "state" if area_name == "Madhya Pradesh" else "division",
        "country_code": "IND",
        "boundary_source_key": "geoboundaries_open",
        "boundary_source_version": "IND-ADM2-test",
        "boundary_artifact_sha256": "a" * 64,
        "boundary_license": "ODbL 1.0",
        "crosswalk_source_url": "https://example.test/crosswalk",
        "crosswalk_snapshot_date": "2026-07-21",
        "transform_id": "dissolve-test-v1",
    }
    return {
        "type": "Feature",
        "properties": properties,
        "geometry": {
            "type": "MultiPolygon",
            "coordinates": [
                [
                    [
                        [west, south],
                        [west + 0.05, south],
                        [west + 0.05, south + 0.05],
                        [west, south + 0.05],
                        [west, south],
                    ]
                ]
            ],
        },
    }


def _write_geojson(path: Path) -> None:
    document = {
        "type": "FeatureCollection",
        "features": [
            _feature(area_name, index)
            for index, area_name in enumerate(MP_LBW_MODEL_AREAS)
        ],
    }
    path.write_text(json.dumps(document), encoding="utf-8")


def test_loads_all_model_areas_with_polygon_and_provenance(
    session: Session, tmp_path: Path
) -> None:
    geojson_path = tmp_path / "mp-model-areas.geojson"
    _write_geojson(geojson_path)

    loaded = load_mp_model_area_geojson(session, geojson_path)
    assert list(loaded) == list(MP_LBW_MODEL_AREAS)
    assert loaded["Madhya Pradesh"].level == "state"
    assert loaded["Gwalior"].level == "division"
    assert json.loads(loaded["Gwalior"].boundary)["type"] == "MultiPolygon"
    assert loaded["Gwalior"].boundary_provenance == {
        "country_code": "IND",
        "source_key": "geoboundaries_open",
        "source_version": "IND-ADM2-test",
        "artifact_sha256": "a" * 64,
        "license": "ODbL 1.0",
        "crosswalk_source_url": "https://example.test/crosswalk",
        "crosswalk_snapshot_date": "2026-07-21",
        "transform_id": "dissolve-test-v1",
    }
    assert loaded["Gwalior"].bbox_west < loaded["Gwalior"].bbox_east
    assert loaded["Gwalior"].bbox_south < loaded["Gwalior"].bbox_north

    load_mp_model_area_geojson(session, geojson_path)
    count = session.scalar(select(func.count()).select_from(AdminUnit))
    assert count == 11


def test_rejects_missing_or_unexpected_model_areas(
    session: Session, tmp_path: Path
) -> None:
    geojson_path = tmp_path / "mp-model-areas.geojson"
    _write_geojson(geojson_path)
    document = json.loads(geojson_path.read_text())
    document["features"].pop()
    geojson_path.write_text(json.dumps(document), encoding="utf-8")

    with pytest.raises(BoundaryRegistryError) as error:
        load_mp_model_area_geojson(session, geojson_path)

    assert error.value.code == "BOUNDARY_MODEL_AREA_SET_MISMATCH"


def test_rejects_mixed_source_provenance(session: Session, tmp_path: Path) -> None:
    geojson_path = tmp_path / "mp-model-areas.geojson"
    _write_geojson(geojson_path)
    document = json.loads(geojson_path.read_text())
    document["features"][1]["properties"]["boundary_artifact_sha256"] = "b" * 64
    geojson_path.write_text(json.dumps(document), encoding="utf-8")

    with pytest.raises(BoundaryRegistryError) as error:
        load_mp_model_area_geojson(session, geojson_path)

    assert error.value.code == "BOUNDARY_PROVENANCE_MISMATCH"


def test_rejects_wrong_level_and_non_polygon_geometry(
    session: Session, tmp_path: Path
) -> None:
    geojson_path = tmp_path / "mp-model-areas.geojson"
    _write_geojson(geojson_path)
    document = json.loads(geojson_path.read_text())
    document["features"][1]["properties"]["geography_level"] = "state"
    geojson_path.write_text(json.dumps(document), encoding="utf-8")

    with pytest.raises(BoundaryRegistryError) as level_error:
        load_mp_model_area_geojson(session, geojson_path)
    assert level_error.value.code == "BOUNDARY_MODEL_AREA_LEVEL_MISMATCH"

    _write_geojson(geojson_path)
    document = json.loads(geojson_path.read_text())
    document["features"][1]["geometry"]["type"] = "Polygon"
    geojson_path.write_text(json.dumps(document), encoding="utf-8")

    with pytest.raises(BoundaryRegistryError) as geometry_error:
        load_mp_model_area_geojson(session, geojson_path)
    assert geometry_error.value.code == "BOUNDARY_GEOMETRY_TYPE_INVALID"
