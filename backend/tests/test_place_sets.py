from __future__ import annotations

import hashlib
import json
from pathlib import Path
from unittest.mock import patch

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from chart.model_registry.place_sets import PlaceSetError, resolve_release_places
from chart.model_registry.schemas import ModelReleaseSpec, PlaceSetSpec
from chart.model_registry.service import get_active_model_mapping
from chart.setup.place_bootstrap import bootstrap_place_from_release
from chart.setup.model_configs import DeployedModelConfig
from chart.setup.schemas import CompleteSetupInput
from chart.setup.service import _validate_setup_geographies, get_options
from chart.shared.db.base import Base
from chart.shared.db.models import AdminUnit


REPO_ROOT = Path(__file__).resolve().parents[2]


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


@pytest.mark.parametrize(
    ("path", "place_count", "shape_count"),
    [
        ("pipelines/places/ke-counties-v1/place-set.json", 47, 47),
        ("pipelines/places/in-mp-v1/place-set.json", 11, 11),
    ],
)
def test_checked_in_place_sets_and_shapes_validate(
    path: str, place_count: int, shape_count: int
) -> None:
    place_set_path = REPO_ROOT / path
    place_set = PlaceSetSpec.model_validate_json(place_set_path.read_text())
    assert len(place_set.geography.places) == place_count
    assert place_set.shape is not None
    shape_path = REPO_ROOT / place_set.shape.path
    assert _sha256(shape_path) == place_set.shape.sha256
    shape = json.loads(shape_path.read_text())
    assert shape["type"] == "FeatureCollection"
    assert len(shape["features"]) == shape_count
    assert (
        len({feature["properties"]["admin_unit_code"] for feature in shape["features"]})
        == shape_count
    )


def test_v2_release_resolves_shared_mp_place_set() -> None:
    place_set_path = REPO_ROOT / "pipelines/places/in-mp-v1/place-set.json"
    spec = ModelReleaseSpec.model_validate(
        {
            "schema_version": 2,
            "id": "under5-mp-v2-test",
            "module": "prediction",
            "outcome": "under_5_mortality",
            "version": "2.0.0",
            "base_uri": "s3://chart-models/under5/2.0.0",
            "runtime": {"adapter": "compact_r_registry", "artifact_type": "rds"},
            "input_contract": {"variables": [{"name": "tmax_lag"}]},
            "model_files": [{"filename": "under5.rds", "sha256": "a" * 64}],
            "place_set": {
                "id": "in-mp-state-divisions",
                "version": "1",
                "path": "pipelines/places/in-mp-v1/place-set.json",
                "sha256": _sha256(place_set_path),
            },
            "coverage": [
                {
                    "place_code": "bhopal",
                    "country_code": "IN",
                    "level": "division",
                    "model_file": "under5.rds",
                    "model_area_name": "Bhopal",
                }
            ],
        }
    )

    resolved = resolve_release_places(spec, repo_root=REPO_ROOT)

    assert resolved.place_set_id == "in-mp-state-divisions"
    assert resolved.geography.country_code == "IN"
    assert len(resolved.geography.places) == 11
    assert resolved.shape_path == (
        REPO_ROOT / "pipelines/places/in-mp-v1/shapes.geojson"
    )
    assert spec.areas[0].place_code == "bhopal"


def test_v2_release_rejects_tampered_place_set_checksum() -> None:
    with pytest.raises(PlaceSetError, match="PLACE_SET_CHECKSUM_MISMATCH"):
        resolve_release_places(
            ModelReleaseSpec.model_validate(
                {
                    "schema_version": 2,
                    "id": "bad-place-set",
                    "module": "prediction",
                    "outcome": "lbw",
                    "version": "2.0.0",
                    "base_uri": "s3://chart-models/lbw/2.0.0",
                    "temperature_input": "three monthly temperatures",
                    "months_required": 3,
                    "model_files": [{"filename": "lbw.rds", "sha256": "a" * 64}],
                    "place_set": {
                        "id": "ke-counties",
                        "version": "1",
                        "path": "pipelines/places/ke-counties-v1/place-set.json",
                        "sha256": "b" * 64,
                    },
                    "coverage": [
                        {
                            "place_code": "kajiado",
                            "country_code": "KE",
                            "level": "county",
                            "model_file": "lbw.rds",
                            "model_area_name": "South-eastern",
                        }
                    ],
                }
            ),
            repo_root=REPO_ROOT,
        )


def test_v2_release_bootstraps_shared_places_and_only_covered_models(
    tmp_path: Path,
) -> None:
    place_set_path = REPO_ROOT / "pipelines/places/in-mp-v1/place-set.json"
    release_path = tmp_path / "release.json"
    release_path.write_text(
        json.dumps(
            {
                "schema_version": 2,
                "id": "under5-mp-v2-bootstrap-test",
                "module": "prediction",
                "outcome": "under_5_mortality",
                "version": "2.0.0",
                "base_uri": "s3://chart-models/under5/2.0.0",
                "runtime": {
                    "adapter": "compact_r_registry",
                    "artifact_type": "rds",
                },
                "input_contract": {"variables": [{"name": "tmax_lag"}]},
                "model_files": [{"filename": "under5.rds", "sha256": "a" * 64}],
                "place_set": {
                    "id": "in-mp-state-divisions",
                    "version": "1",
                    "path": "pipelines/places/in-mp-v1/place-set.json",
                    "sha256": _sha256(place_set_path),
                },
                "coverage": [
                    {
                        "place_code": "bhopal",
                        "country_code": "IN",
                        "level": "division",
                        "model_file": "under5.rds",
                        "model_area_name": "Bhopal",
                    }
                ],
            }
        )
    )
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    with factory() as session:
        result = bootstrap_place_from_release(
            session, model_release_path=release_path, activate=True
        )
        session.flush()
        assert result.areas_seeded == 11
        units = {unit.code: unit for unit in session.scalars(select(AdminUnit)).all()}
        assert len(units) == 11
        assert units["madhya-pradesh"].bbox_north is not None
        assert (
            get_active_model_mapping(
                session,
                admin_unit_id=units["madhya-pradesh"].id,
                outcome="under_5_mortality",
            )
            is None
        )
        bhopal = get_active_model_mapping(
            session,
            admin_unit_id=units["bhopal"].id,
            outcome="under_5_mortality",
        )
        assert bhopal is not None
        assert bhopal.model_area_name == "Bhopal"


def test_v2_place_set_drives_setup_parent_and_supported_child(
    tmp_path: Path,
) -> None:
    place_set_path = REPO_ROOT / "pipelines/places/in-mp-v1/place-set.json"
    release_path = tmp_path / "model-release.v2.json"
    release_path.write_text(
        json.dumps(
            {
                "schema_version": 2,
                "id": "under5-mp-v2-options-test",
                "module": "prediction",
                "outcome": "under_5_mortality",
                "version": "2.0.0",
                "base_uri": "s3://chart-models/under5/2.0.0",
                "runtime": {
                    "adapter": "compact_r_registry",
                    "artifact_type": "rds",
                },
                "input_contract": {"variables": [{"name": "tmax_lag"}]},
                "model_files": [{"filename": "under5.rds", "sha256": "a" * 64}],
                "place_set": {
                    "id": "in-mp-state-divisions",
                    "version": "1",
                    "path": "pipelines/places/in-mp-v1/place-set.json",
                    "sha256": _sha256(place_set_path),
                },
                "coverage": [
                    {
                        "place_code": "bhopal",
                        "country_code": "IN",
                        "level": "division",
                        "model_file": "under5.rds",
                        "model_area_name": "Bhopal",
                    }
                ],
            }
        )
    )
    config = DeployedModelConfig(country_code="IN", model_release=release_path)
    with patch("chart.setup.service.deployed_configs", return_value=(config,)):
        options = get_options()
    assert len(options.geographies) == 1
    places = {place.placeCode: place for place in options.geographies[0].places}
    assert set(places) == {"madhya-pradesh", "bhopal"}
    assert places["madhya-pradesh"].predictionSupported is False
    assert places["bhopal"].predictionSupported is True

    request = CompleteSetupInput.model_validate(
        {
            "countryCode": "IN",
            "countryName": "India",
            "geographyLevelLabel": "State",
            "primarySectorId": "health",
            "geographies": [
                {
                    "id": "geo-in-madhya-pradesh",
                    "level": "geo_level_1",
                    "levelLabel": "State",
                    "name": "Madhya Pradesh",
                    "parentId": "geo-in",
                    "path": "/india/madhya-pradesh",
                    "sortOrder": 10,
                },
                {
                    "id": "geo-in-madhya-pradesh-division-bhopal",
                    "level": "geo_level_2",
                    "levelLabel": "Division",
                    "name": "Bhopal Division",
                    "parentId": "geo-in-madhya-pradesh",
                    "path": "/india/madhya-pradesh/divisions/bhopal",
                    "sortOrder": 10,
                },
            ],
        }
    )
    with patch("chart.setup.service.configs_for_country", return_value=(config,)):
        geography = _validate_setup_geographies(request)
    assert geography.analytics_slug == "madhya-pradesh"
