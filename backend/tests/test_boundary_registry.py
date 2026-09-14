from __future__ import annotations

from dataclasses import replace

import pytest

from chart.geographies.schemas import (
    BoundaryRegistryError,
    ModelAreaBoundaryMapping,
    ModelAreaDefinition,
)
from chart.geographies.service import (
    confirm_boundary_selection,
    recommend_boundary_source,
    validate_model_area_crosswalk,
)


def test_india_prefers_its_national_source_over_a_global_source() -> None:
    recommendation = recommend_boundary_source(
        country_code="IND",
        native_level="admin2",
        available_source_keys={"india_ogd_admin_boundaries", "geoboundaries_open"},
    )

    assert recommendation.recommended_source_key == "india_ogd_admin_boundaries"
    assert recommendation.candidate_source_keys == (
        "india_ogd_admin_boundaries",
        "geoboundaries_open",
    )
    assert recommendation.requires_confirmation is True


def test_kenya_prefers_an_available_authoritative_global_source() -> None:
    recommendation = recommend_boundary_source(
        country_code="KEN",
        native_level="admin1",
        available_source_keys={"un_salb", "geoboundaries_open"},
    )

    assert recommendation.recommended_source_key == "un_salb"
    assert recommendation.candidate_source_keys == (
        "un_salb",
        "geoboundaries_open",
    )


def test_user_can_explicitly_choose_the_compatible_global_fallback_for_india() -> None:
    selection = confirm_boundary_selection(
        country_code="IND",
        source_key="geoboundaries_open",
        source_version="gbOpen-2026",
        native_level="admin1",
        target_level="state",
        transform_id="normalize-admin1-to-state-v1",
        artifact_uri="https://example.test/IND-ADM1.geojson",
        artifact_checksum="a" * 64,
        selected_by="test-user",
        license_accepted=True,
        artifact_license_name="Open Data Commons Open Database License 1.0",
        available_source_keys={"india_ogd_admin_boundaries", "geoboundaries_open"},
    )

    assert selection.source_key == "geoboundaries_open"
    assert selection.license_name == "Open Data Commons Open Database License 1.0"
    assert len(selection.selection_id) == 64


def test_selection_never_silently_substitutes_an_available_fallback() -> None:
    with pytest.raises(BoundaryRegistryError) as error:
        confirm_boundary_selection(
            country_code="IND",
            source_key="india_ogd_admin_boundaries",
            source_version="2022-09-28",
            native_level="admin2",
            target_level="division",
            transform_id="dissolve-district-to-division-v1",
            artifact_uri="https://example.test/india-districts.zip",
            artifact_checksum="b" * 64,
            selected_by="test-user",
            license_accepted=True,
            available_source_keys={"geoboundaries_open"},
        )

    assert error.value.code == "BOUNDARY_SOURCE_NOT_AVAILABLE"


def test_selection_requires_license_checksum_version_and_transform() -> None:
    common = {
        "country_code": "IND",
        "source_key": "india_ogd_admin_boundaries",
        "source_version": "2022-09-28",
        "native_level": "admin2",
        "target_level": "division",
        "artifact_uri": "https://example.test/india-districts.zip",
        "artifact_checksum": "c" * 64,
        "selected_by": "test-user",
        "license_accepted": True,
        "available_source_keys": {"india_ogd_admin_boundaries"},
        "transform_id": "dissolve-district-to-division-v1",
    }

    for change, expected_code in [
        ({"license_accepted": False}, "BOUNDARY_LICENSE_NOT_ACCEPTED"),
        ({"source_version": ""}, "BOUNDARY_SOURCE_VERSION_REQUIRED"),
        ({"artifact_checksum": "not-a-hash"}, "BOUNDARY_CHECKSUM_INVALID"),
        ({"transform_id": None}, "BOUNDARY_TRANSFORM_REQUIRED"),
    ]:
        with pytest.raises(BoundaryRegistryError) as error:
            confirm_boundary_selection(**(common | change))
        assert error.value.code == expected_code


def test_artifact_specific_source_requires_the_exact_artifact_license() -> None:
    with pytest.raises(BoundaryRegistryError) as error:
        confirm_boundary_selection(
            country_code="IND",
            source_key="geoboundaries_open",
            source_version="IND-ADM2-76128533",
            native_level="admin2",
            target_level="division",
            transform_id="dissolve-district-to-division-v1",
            artifact_uri="https://example.test/IND-ADM2.geojson",
            artifact_checksum="f" * 64,
            selected_by="test-user",
            license_accepted=True,
            available_source_keys={"geoboundaries_open"},
        )

    assert error.value.code == "BOUNDARY_ARTIFACT_LICENSE_REQUIRED"


def _selection(*, target_level: str, transform_id: str):
    return confirm_boundary_selection(
        country_code="IND",
        source_key="india_ogd_admin_boundaries",
        source_version="2022-09-28",
        native_level="admin1" if target_level == "state" else "admin2",
        target_level=target_level,
        transform_id=transform_id,
        artifact_uri=f"https://example.test/india-{target_level}.zip",
        artifact_checksum=("d" if target_level == "state" else "e") * 64,
        selected_by="test-user",
        license_accepted=True,
        available_source_keys={"india_ogd_admin_boundaries"},
    )


def test_model_area_crosswalk_requires_exact_country_level_and_coverage() -> None:
    state = _selection(
        target_level="state", transform_id="normalize-admin1-to-state-v1"
    )
    division = _selection(
        target_level="division", transform_id="dissolve-district-to-division-v1"
    )
    definitions = [
        ModelAreaDefinition("Madhya Pradesh", "state", "IND"),
        ModelAreaDefinition("Gwalior", "division", "IND"),
    ]
    mappings = [
        ModelAreaBoundaryMapping(
            "Madhya Pradesh", "madhya-pradesh", "state", state.selection_id
        ),
        ModelAreaBoundaryMapping(
            "Gwalior", "gwalior", "division", division.selection_id
        ),
    ]
    selections = {
        state.selection_id: state,
        division.selection_id: division,
    }

    validated = validate_model_area_crosswalk(definitions, mappings, selections)
    assert [mapping.model_area_name for mapping in validated] == [
        "Gwalior",
        "Madhya Pradesh",
    ]

    with pytest.raises(BoundaryRegistryError) as missing_error:
        validate_model_area_crosswalk(definitions, mappings[:1], selections)
    assert missing_error.value.code == "MODEL_AREA_MAPPING_MISSING"

    wrong_level = replace(mappings[1], admin_unit_level="state")
    with pytest.raises(BoundaryRegistryError) as level_error:
        validate_model_area_crosswalk(
            definitions,
            [mappings[0], wrong_level],
            selections,
        )
    assert level_error.value.code == "MODEL_AREA_LEVEL_MISMATCH"
