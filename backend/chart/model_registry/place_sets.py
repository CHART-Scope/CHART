from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from pathlib import Path

from .schemas import ModelReleaseSpec, PlaceSetSpec, ReleaseGeographySpec


_DEFAULT_REPO_ROOT = Path(__file__).resolve().parents[3]


class PlaceSetError(ValueError):
    def __init__(self, code: str, detail: str = "") -> None:
        super().__init__(f"{code}: {detail}" if detail else code)
        self.code = code
        self.detail = detail


@dataclass(frozen=True)
class ResolvedReleasePlaces:
    geography: ReleaseGeographySpec
    shape_path: Path | None
    place_set_id: str | None = None
    place_set_version: str | None = None


def resolve_release_places(
    spec: ModelReleaseSpec,
    *,
    repo_root: Path | None = None,
) -> ResolvedReleasePlaces:
    """Resolve embedded v1 geography or a checksummed shared v2 place set."""

    root = (repo_root or _repo_root()).resolve()
    if spec.place_set is None:
        if spec.geography is None:
            raise PlaceSetError("MODEL_RELEASE_GEOGRAPHY_REQUIRED", spec.id)
        shape_path = (
            _resolve_inside(root, root / spec.geography.boundary_artifact)
            if spec.geography.boundary_artifact
            else None
        )
        _validate_coverage(spec, spec.geography)
        return ResolvedReleasePlaces(spec.geography, shape_path)

    reference = spec.place_set
    place_set_path = _resolve_inside(root, root / reference.path)
    _verify_file(place_set_path, reference.sha256, "MODEL_RELEASE_PLACE_SET")
    try:
        place_set = PlaceSetSpec.model_validate_json(
            place_set_path.read_text(encoding="utf-8")
        )
    except (OSError, ValueError) as error:
        raise PlaceSetError("MODEL_RELEASE_PLACE_SET_INVALID", str(error)) from error
    if place_set.id != reference.id or place_set.version != reference.version:
        raise PlaceSetError(
            "MODEL_RELEASE_PLACE_SET_IDENTITY_MISMATCH",
            f"expected {reference.id}@{reference.version}",
        )

    shape_path = None
    if place_set.shape is not None:
        shape_path = _resolve_inside(root, root / place_set.shape.path)
        _verify_file(shape_path, place_set.shape.sha256, "PLACE_SET_SHAPE")
    _validate_coverage(spec, place_set.geography)
    return ResolvedReleasePlaces(
        geography=place_set.geography,
        shape_path=shape_path,
        place_set_id=place_set.id,
        place_set_version=place_set.version,
    )


def _validate_coverage(spec: ModelReleaseSpec, geography: ReleaseGeographySpec) -> None:
    places = {place.place_code: place for place in geography.places}
    missing = sorted({area.place_code for area in spec.areas} - set(places))
    if missing:
        raise PlaceSetError(
            "MODEL_RELEASE_GEOGRAPHY_MAPPING_UNKNOWN", ", ".join(missing)
        )
    for area in spec.areas:
        place = places[area.place_code]
        if (
            area.country_code is not None
            and area.country_code != geography.country_code
        ):
            raise PlaceSetError("MODEL_RELEASE_AREA_COUNTRY_MISMATCH", area.place_code)
        if area.level is not None and area.level != place.level:
            raise PlaceSetError("MODEL_RELEASE_AREA_LEVEL_MISMATCH", area.place_code)


def _repo_root() -> Path:
    return Path(os.environ.get("CHART_REPO_ROOT", _DEFAULT_REPO_ROOT))


def _resolve_inside(root: Path, candidate: Path) -> Path:
    resolved = candidate.resolve()
    if not resolved.is_relative_to(root):
        raise PlaceSetError("MODEL_RELEASE_PATH_OUTSIDE_REPOSITORY", str(candidate))
    return resolved


def _verify_file(path: Path, expected: str, prefix: str) -> None:
    if not path.is_file():
        raise PlaceSetError(f"{prefix}_MISSING", str(path))
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != expected:
        raise PlaceSetError(
            f"{prefix}_CHECKSUM_MISMATCH",
            f"expected {expected}, got {digest}",
        )
