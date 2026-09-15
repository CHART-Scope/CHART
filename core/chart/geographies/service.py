from __future__ import annotations

import re
from collections.abc import Iterable, Mapping, Sequence

from .catalog import BOUNDARY_SOURCES
from .schemas import (
    BoundaryDatasetSelection,
    BoundaryRegistryError,
    BoundarySource,
    BoundarySourceRecommendation,
    ModelAreaBoundaryMapping,
    ModelAreaDefinition,
)

_AUTHORITY_PRIORITY = {
    "national": 0,
    "un_authoritative": 1,
    "open_global": 2,
}
_SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")


def recommend_boundary_source(
    *,
    country_code: str,
    native_level: str,
    available_source_keys: Iterable[str],
    sources: Mapping[str, BoundarySource] = BOUNDARY_SOURCES,
) -> BoundarySourceRecommendation:
    """Rank compatible sources; the caller must still confirm one explicitly."""

    country = _normalize_country_code(country_code)
    available = set(available_source_keys)
    candidates = [
        source
        for source in sources.values()
        if source.key in available and source.supports(country, native_level)
    ]
    if not candidates:
        raise BoundaryRegistryError(
            "BOUNDARY_SOURCE_NOT_AVAILABLE",
            f"no source supports {country} {native_level}",
        )
    candidates.sort(key=lambda source: _source_rank(source, country))
    return BoundarySourceRecommendation(
        country_code=country,
        native_level=native_level,
        recommended_source_key=candidates[0].key,
        candidate_source_keys=tuple(source.key for source in candidates),
    )


def confirm_boundary_selection(
    *,
    country_code: str,
    source_key: str,
    source_version: str,
    native_level: str,
    target_level: str,
    artifact_uri: str,
    artifact_checksum: str,
    selected_by: str,
    license_accepted: bool,
    available_source_keys: Iterable[str],
    transform_id: str | None = None,
    artifact_license_name: str | None = None,
    sources: Mapping[str, BoundarySource] = BOUNDARY_SOURCES,
) -> BoundaryDatasetSelection:
    """Confirm a user-selected source without silently substituting a fallback."""

    country = _normalize_country_code(country_code)
    source = sources.get(source_key)
    if source is None:
        raise BoundaryRegistryError("BOUNDARY_SOURCE_UNKNOWN", source_key)
    if source_key not in set(available_source_keys):
        raise BoundaryRegistryError("BOUNDARY_SOURCE_NOT_AVAILABLE", source_key)
    if not source.supports(country, native_level):
        raise BoundaryRegistryError(
            "BOUNDARY_SOURCE_INCOMPATIBLE", f"{source_key} {country} {native_level}"
        )
    if not license_accepted:
        raise BoundaryRegistryError("BOUNDARY_LICENSE_NOT_ACCEPTED", source_key)
    if source.license_requires_review and not artifact_license_name:
        raise BoundaryRegistryError(
            "BOUNDARY_ARTIFACT_LICENSE_REQUIRED",
            f"{source_key} publishes licence terms per artifact",
        )

    _require_text(source_version, "BOUNDARY_SOURCE_VERSION_REQUIRED")
    _require_text(target_level, "BOUNDARY_TARGET_LEVEL_REQUIRED")
    _require_text(artifact_uri, "BOUNDARY_ARTIFACT_URI_REQUIRED")
    _require_text(selected_by, "BOUNDARY_SELECTED_BY_REQUIRED")
    if not _SHA256_PATTERN.fullmatch(artifact_checksum):
        raise BoundaryRegistryError(
            "BOUNDARY_CHECKSUM_INVALID", "expected lowercase SHA-256"
        )
    if native_level != target_level and not transform_id:
        raise BoundaryRegistryError(
            "BOUNDARY_TRANSFORM_REQUIRED",
            f"{native_level} must be transformed to {target_level}",
        )

    return BoundaryDatasetSelection(
        country_code=country,
        source_key=source.key,
        source_version=source_version,
        native_level=native_level,
        target_level=target_level,
        artifact_uri=artifact_uri,
        artifact_checksum=artifact_checksum,
        license_name=artifact_license_name or source.license_name,
        selected_by=selected_by,
        transform_id=transform_id,
    )


def validate_model_area_crosswalk(
    definitions: Sequence[ModelAreaDefinition],
    mappings: Sequence[ModelAreaBoundaryMapping],
    selections: Mapping[str, BoundaryDatasetSelection],
) -> tuple[ModelAreaBoundaryMapping, ...]:
    """Require one same-level, versioned admin unit for every model area."""

    expected = {definition.name: definition for definition in definitions}
    if len(expected) != len(definitions):
        raise BoundaryRegistryError(
            "MODEL_AREA_DEFINITION_DUPLICATE", "model area names must be unique"
        )
    actual: dict[str, ModelAreaBoundaryMapping] = {}
    admin_units: set[tuple[str, str, str]] = set()
    for mapping in mappings:
        if mapping.model_area_name in actual:
            raise BoundaryRegistryError(
                "MODEL_AREA_MAPPING_DUPLICATE", mapping.model_area_name
            )
        definition = expected.get(mapping.model_area_name)
        if definition is None:
            raise BoundaryRegistryError(
                "MODEL_AREA_MAPPING_UNKNOWN", mapping.model_area_name
            )
        selection = selections.get(mapping.boundary_selection_id)
        if selection is None:
            raise BoundaryRegistryError(
                "MODEL_AREA_BOUNDARY_SELECTION_UNKNOWN", mapping.boundary_selection_id
            )
        if selection.country_code != definition.country_code:
            raise BoundaryRegistryError(
                "MODEL_AREA_COUNTRY_MISMATCH", mapping.model_area_name
            )
        if (
            mapping.admin_unit_level != definition.geography_level
            or selection.target_level != definition.geography_level
        ):
            raise BoundaryRegistryError(
                "MODEL_AREA_LEVEL_MISMATCH", mapping.model_area_name
            )
        unit_key = (
            selection.country_code,
            mapping.admin_unit_level,
            mapping.admin_unit_code,
        )
        if unit_key in admin_units:
            raise BoundaryRegistryError(
                "MODEL_AREA_ADMIN_UNIT_DUPLICATE", mapping.admin_unit_code
            )
        admin_units.add(unit_key)
        actual[mapping.model_area_name] = mapping

    missing = sorted(set(expected) - set(actual))
    if missing:
        raise BoundaryRegistryError("MODEL_AREA_MAPPING_MISSING", ", ".join(missing))
    return tuple(actual[name] for name in sorted(actual))


def _source_rank(source: BoundarySource, country_code: str) -> tuple[int, int, str]:
    country_specific = 0 if source.country_codes == frozenset({country_code}) else 1
    return country_specific, _AUTHORITY_PRIORITY[source.authority], source.key


def _normalize_country_code(value: str) -> str:
    normalized = value.strip().upper()
    if len(normalized) != 3 or not normalized.isalpha():
        raise BoundaryRegistryError("BOUNDARY_COUNTRY_CODE_INVALID", value)
    return normalized


def _require_text(value: str, code: str) -> None:
    if not value.strip():
        raise BoundaryRegistryError(code, "value must not be empty")
