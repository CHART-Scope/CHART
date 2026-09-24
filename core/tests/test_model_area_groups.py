"""Model-area grouping and coverage gaps must agree with the coverage list.

The grouping exists so a reader can answer "what blocks does this model have
and what does each cover?" without grouping ``coverage`` by hand. That is only
useful if it cannot drift away from the coverage it claims to summarise.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from chart.model_registry.schemas import ModelReleaseSpec

REPO_ROOT = Path(__file__).resolve().parents[2]
PLACE_SET = REPO_ROOT / "pipelines/places/in-mp-v1/place-set.json"


def _spec(**overrides) -> dict:
    base = {
        "schema_version": 2,
        "id": "grouping-test",
        "module": "prediction",
        "outcome": "lbw",
        "version": "1.0.0",
        "base_uri": "s3://chart-models/test/1.0.0",
        "runtime": {"adapter": "compact_r_registry", "artifact_type": "rds"},
        "input_contract": {"variables": [{"name": "tmax_lag", "length": 3}]},
        "model_files": [{"filename": "test.rds", "sha256": "a" * 64}],
        "place_set": {
            "id": "in-mp-state-divisions",
            "version": "1",
            "path": "pipelines/places/in-mp-v1/place-set.json",
            "sha256": hashlib.sha256(PLACE_SET.read_bytes()).hexdigest(),
        },
        "coverage": [
            {
                "place_code": "bhopal",
                "level": "division",
                "model_file": "test.rds",
                "model_area_name": "Bhopal",
            },
            {
                "place_code": "chambal",
                "level": "division",
                "model_file": "test.rds",
                "model_area_name": "Bhopal",
            },
        ],
    }
    base.update(overrides)
    return base


def test_grouping_may_cover_many_places_with_one_block() -> None:
    """The Kenya shape: one fitted block, many member places."""

    spec = ModelReleaseSpec.model_validate(
        _spec(
            model_areas=[
                {
                    "name": "Bhopal",
                    "level": "division",
                    "members": ["bhopal", "chambal"],
                }
            ]
        )
    )

    assert spec.model_areas is not None
    assert spec.model_areas[0].members == ("bhopal", "chambal")


def test_grouping_rejects_a_block_that_is_not_in_coverage() -> None:
    with pytest.raises(ValidationError, match="MODEL_RELEASE_AREA_GROUP_UNKNOWN"):
        ModelReleaseSpec.model_validate(
            _spec(
                model_areas=[
                    {"name": "Gwalior", "level": "division", "members": ["bhopal"]}
                ]
            )
        )


def test_grouping_rejects_a_member_placed_under_the_wrong_block() -> None:
    """chambal scores against Bhopal; claiming otherwise must not validate."""

    with pytest.raises(ValidationError, match="MODEL_RELEASE_AREA_GROUP_MISMATCH"):
        ModelReleaseSpec.model_validate(
            _spec(
                coverage=[
                    {
                        "place_code": "bhopal",
                        "level": "division",
                        "model_file": "test.rds",
                        "model_area_name": "Bhopal",
                    },
                    {
                        "place_code": "chambal",
                        "level": "division",
                        "model_file": "test.rds",
                        "model_area_name": "Chambal",
                    },
                ],
                model_areas=[
                    {"name": "Bhopal", "level": "division", "members": ["chambal"]},
                    {"name": "Chambal", "level": "division", "members": ["bhopal"]},
                ],
            )
        )


def test_coverage_gap_cannot_name_a_scored_place() -> None:
    """A gap says "not modelled"; a scored place would contradict the map."""

    with pytest.raises(ValidationError, match="MODEL_RELEASE_COVERAGE_GAP_SCORED"):
        ModelReleaseSpec.model_validate(
            _spec(coverage_gaps=[{"place_code": "bhopal", "reason": "nope"}])
        )


def test_shipped_manifests_declare_their_blocks_and_gaps() -> None:
    """The three real releases carry a readable coverage story."""

    expected = {
        "pipelines/models/lbw/model-release.kenya.review.json": (5, ["turkana"]),
        "pipelines/models/lbw/model-release.mp.compact.review.json": (11, []),
        "pipelines/models/under_five_mortality/model-release.mp.review.json": (
            10,
            ["madhya-pradesh"],
        ),
    }
    for relative, (block_count, gap_codes) in expected.items():
        spec = ModelReleaseSpec.model_validate_json(
            (REPO_ROOT / relative).read_text(encoding="utf-8")
        )
        assert spec.schema_version == 2, relative
        assert spec.model_areas is not None, relative
        assert len(spec.model_areas) == block_count, relative
        assert [gap.place_code for gap in spec.coverage_gaps or []] == gap_codes

    kenya = ModelReleaseSpec.model_validate_json(
        (REPO_ROOT / "pipelines/models/lbw/model-release.kenya.review.json").read_text(
            encoding="utf-8"
        )
    )
    zones = {group.name: len(group.members) for group in kenya.model_areas or []}
    assert zones["Lake Victoria Basin & Western Highlands"] == 21
    assert all(group.level == "climate_zone" for group in kenya.model_areas or [])


def test_manifest_json_round_trips_without_loss() -> None:
    """Nothing in the migrated files is dropped by the schema."""

    relative = "pipelines/models/lbw/model-release.kenya.review.json"
    raw = json.loads((REPO_ROOT / relative).read_text(encoding="utf-8"))
    spec = ModelReleaseSpec.model_validate(raw)
    assert len(spec.coverage or []) == len(raw["coverage"])
    assert spec.place_set is not None and spec.place_set.id == "ke-counties"
