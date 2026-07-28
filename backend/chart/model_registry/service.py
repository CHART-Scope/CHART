from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import cast

from sqlalchemy import select
from sqlalchemy.orm import Session

from chart.shared.db.models import (
    ActiveModelAssignment,
    AdminUnit,
    ModelAreaMapping,
    ModelRelease,
)

from .schemas import ModelReleaseSpec, PregnancyWindow


class ModelRegistryError(ValueError):
    def __init__(self, code: str, detail: str = "") -> None:
        super().__init__(f"{code}: {detail}" if detail else code)
        self.code = code
        self.detail = detail


@dataclass(frozen=True)
class ActiveModelMapping:
    release_id: str
    version: str
    model_area_name: str
    model_file: str
    artifact_sha256: str
    validated_pregnancy_windows: tuple[PregnancyWindow, ...]


def register_model_release(
    session: Session,
    spec: ModelReleaseSpec,
    *,
    model_dir: Path | None = None,
    activate: bool = False,
) -> ModelRelease:
    """Validate and register one immutable model release."""

    if model_dir is not None:
        _verify_files(spec, model_dir)

    admin_units = {
        item.code: item
        for item in session.scalars(
            select(AdminUnit).where(
                AdminUnit.code.in_([area.place_code for area in spec.areas])
            )
        )
    }
    missing_places = sorted({area.place_code for area in spec.areas} - set(admin_units))
    if missing_places:
        raise ModelRegistryError(
            "MODEL_RELEASE_PLACE_UNKNOWN", ", ".join(missing_places)
        )

    existing = session.get(ModelRelease, spec.id)
    payload = _release_payload(spec)
    if existing is not None:
        if (
            existing.module != spec.module
            or existing.outcome != spec.outcome
            or existing.version != spec.version
            or existing.model_files != payload["model_files"]
            or existing.input_spec != payload["input_spec"]
            or not _area_mappings_match(existing, spec, admin_units)
        ):
            raise ModelRegistryError("MODEL_RELEASE_IMMUTABLE", spec.id)
        if activate:
            _activate_release(session, existing)
            session.flush()
        return existing

    release = ModelRelease(
        id=spec.id,
        module=spec.module,
        outcome=spec.outcome,
        version=spec.version,
        status="validated" if model_dir is not None else "uploaded",
        model_files=payload["model_files"],
        input_spec=payload["input_spec"],
        release_notes=spec.release_notes,
        source_git_ref=spec.source_git_ref,
        release_file_uri=f"{spec.base_uri.rstrip('/')}/model-release.json",
    )
    session.add(release)
    session.flush()

    for area in spec.areas:
        session.add(
            ModelAreaMapping(
                model_release_id=release.id,
                admin_unit_id=admin_units[area.place_code].id,
                model_area_key=area.model_area_name,
                model_file=area.model_file,
                validated_pregnancy_windows=list(area.validated_pregnancy_windows),
            )
        )

    if activate:
        _activate_release(session, release)
    session.flush()
    return release


def get_active_model_mapping(
    session: Session,
    *,
    admin_unit_id: int,
    module: str = "prediction",
    outcome: str = "lbw",
) -> ActiveModelMapping | None:
    row = session.execute(
        select(ModelRelease, ModelAreaMapping)
        .join(
            ActiveModelAssignment,
            ActiveModelAssignment.model_release_id == ModelRelease.id,
        )
        .join(
            ModelAreaMapping,
            (ModelAreaMapping.model_release_id == ModelRelease.id)
            & (ModelAreaMapping.admin_unit_id == ActiveModelAssignment.admin_unit_id),
        )
        .where(
            ActiveModelAssignment.module == module,
            ActiveModelAssignment.outcome == outcome,
            ActiveModelAssignment.admin_unit_id == admin_unit_id,
        )
        .limit(1)
    ).first()
    if row is None:
        return None
    release, mapping = row
    return ActiveModelMapping(
        release_id=release.id,
        version=release.version,
        model_area_name=mapping.model_area_key,
        model_file=mapping.model_file,
        artifact_sha256=_artifact_digest(release, mapping.model_file),
        validated_pregnancy_windows=_validated_pregnancy_windows(mapping),
    )


def get_active_model_mappings(
    session: Session,
    admin_unit_ids: list[int],
    *,
    module: str = "prediction",
    outcome: str = "lbw",
) -> dict[int, ActiveModelMapping]:
    if not admin_unit_ids:
        return {}
    rows = session.execute(
        select(
            ActiveModelAssignment.admin_unit_id,
            ModelRelease,
            ModelAreaMapping,
        )
        .join(
            ModelRelease,
            ModelRelease.id == ActiveModelAssignment.model_release_id,
        )
        .join(
            ModelAreaMapping,
            (ModelAreaMapping.model_release_id == ModelRelease.id)
            & (ModelAreaMapping.admin_unit_id == ActiveModelAssignment.admin_unit_id),
        )
        .where(
            ActiveModelAssignment.module == module,
            ActiveModelAssignment.outcome == outcome,
            ActiveModelAssignment.admin_unit_id.in_(admin_unit_ids),
        )
    ).all()
    return {
        admin_unit_id: ActiveModelMapping(
            release_id=release.id,
            version=release.version,
            model_area_name=mapping.model_area_key,
            model_file=mapping.model_file,
            artifact_sha256=_artifact_digest(release, mapping.model_file),
            validated_pregnancy_windows=_validated_pregnancy_windows(mapping),
        )
        for admin_unit_id, release, mapping in rows
    }


def get_model_mapping(
    session: Session,
    *,
    release_id: str,
    admin_unit_id: int,
) -> ActiveModelMapping | None:
    row = session.execute(
        select(ModelRelease, ModelAreaMapping)
        .join(
            ModelAreaMapping,
            ModelAreaMapping.model_release_id == ModelRelease.id,
        )
        .where(
            ModelRelease.id == release_id,
            ModelAreaMapping.admin_unit_id == admin_unit_id,
        )
        .limit(1)
    ).first()
    if row is None:
        return None
    release, mapping = row
    return ActiveModelMapping(
        release_id=release.id,
        version=release.version,
        model_area_name=mapping.model_area_key,
        model_file=mapping.model_file,
        artifact_sha256=_artifact_digest(release, mapping.model_file),
        validated_pregnancy_windows=_validated_pregnancy_windows(mapping),
    )


def get_model_mappings(
    session: Session,
    keys: set[tuple[str, int]],
) -> dict[tuple[str, int], ActiveModelMapping]:
    if not keys:
        return {}
    release_ids = {release_id for release_id, _ in keys}
    admin_unit_ids = {admin_unit_id for _, admin_unit_id in keys}
    rows = session.execute(
        select(ModelRelease, ModelAreaMapping)
        .join(
            ModelAreaMapping,
            ModelAreaMapping.model_release_id == ModelRelease.id,
        )
        .where(
            ModelRelease.id.in_(release_ids),
            ModelAreaMapping.admin_unit_id.in_(admin_unit_ids),
        )
    ).all()
    return {
        (release.id, mapping.admin_unit_id): ActiveModelMapping(
            release_id=release.id,
            version=release.version,
            model_area_name=mapping.model_area_key,
            model_file=mapping.model_file,
            artifact_sha256=_artifact_digest(release, mapping.model_file),
            validated_pregnancy_windows=_validated_pregnancy_windows(mapping),
        )
        for release, mapping in rows
        if (release.id, mapping.admin_unit_id) in keys
    }


def _validated_pregnancy_windows(
    mapping: ModelAreaMapping,
) -> tuple[PregnancyWindow, ...]:
    raw_windows = tuple(mapping.validated_pregnancy_windows or ())
    if (
        not raw_windows
        or len(set(raw_windows)) != len(raw_windows)
        or any(
            type(window) is not int or window not in (1, 2, 3) for window in raw_windows
        )
    ):
        raise ModelRegistryError(
            "MODEL_RELEASE_PREGNANCY_WINDOWS_INVALID",
            f"{mapping.model_release_id}:{mapping.admin_unit_id}",
        )
    return cast(tuple[PregnancyWindow, ...], raw_windows)


def _activate_release(session: Session, release: ModelRelease) -> None:
    mappings = list(
        session.scalars(
            select(ModelAreaMapping).where(
                ModelAreaMapping.model_release_id == release.id
            )
        )
    )
    if not mappings:
        raise ModelRegistryError("MODEL_RELEASE_AREA_REQUIRED", release.id)

    # Serialize overlapping activations on stable parent rows. Locking in a
    # deterministic order avoids both duplicate assignment inserts and
    # cross-release deadlocks.
    admin_unit_ids = sorted({mapping.admin_unit_id for mapping in mappings})
    list(
        session.scalars(
            select(AdminUnit.id)
            .where(AdminUnit.id.in_(admin_unit_ids))
            .order_by(AdminUnit.id)
            .with_for_update()
        )
    )

    replaced_release_ids: set[str] = set()
    activated_at = datetime.now(timezone.utc)
    for mapping in mappings:
        key = (mapping.admin_unit_id, release.module, release.outcome)
        assignment = session.get(ActiveModelAssignment, key)
        if assignment is None:
            assignment = ActiveModelAssignment(
                admin_unit_id=mapping.admin_unit_id,
                module=release.module,
                outcome=release.outcome,
                model_release_id=release.id,
                activated_at=activated_at,
            )
            session.add(assignment)
        else:
            if assignment.model_release_id != release.id:
                replaced_release_ids.add(assignment.model_release_id)
            assignment.model_release_id = release.id
            assignment.activated_at = activated_at

    release.status = "active"
    release.activated_at = activated_at
    session.flush()

    for release_id in replaced_release_ids:
        still_assigned = session.scalar(
            select(ActiveModelAssignment.admin_unit_id)
            .where(ActiveModelAssignment.model_release_id == release_id)
            .limit(1)
        )
        if still_assigned is None:
            previous = session.get(ModelRelease, release_id)
            if previous is not None:
                previous.status = "superseded"


def _verify_files(spec: ModelReleaseSpec, model_dir: Path) -> None:
    for model_file in spec.model_files:
        path = model_dir / model_file.filename
        if not path.is_file():
            raise ModelRegistryError("MODEL_RELEASE_FILE_MISSING", str(path))
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != model_file.sha256:
            raise ModelRegistryError(
                "MODEL_RELEASE_CHECKSUM_MISMATCH", model_file.filename
            )


def _artifact_digest(release: ModelRelease, model_file: str) -> str:
    expected_name = Path(model_file).name
    for item in release.model_files:
        if Path(str(item.get("filename", ""))).name == expected_name:
            digest = str(item.get("sha256", ""))
            if len(digest) == 64:
                return digest
    raise ModelRegistryError("MODEL_RELEASE_ARTIFACT_UNDECLARED", model_file)


def _area_mappings_match(
    release: ModelRelease,
    spec: ModelReleaseSpec,
    admin_units: dict[str, AdminUnit],
) -> bool:
    current = {
        (
            mapping.admin_unit_id,
            mapping.model_area_key,
            mapping.model_file,
            tuple(mapping.validated_pregnancy_windows),
        )
        for mapping in release.area_mappings
    }
    expected = {
        (
            admin_units[area.place_code].id,
            area.model_area_name,
            area.model_file,
            tuple(area.validated_pregnancy_windows),
        )
        for area in spec.areas
    }
    return current == expected


def _release_payload(spec: ModelReleaseSpec) -> dict:
    return {
        "model_files": [
            {
                "filename": item.filename,
                "sha256": item.sha256,
                "uri": f"{spec.base_uri.rstrip('/')}/{item.filename}",
            }
            for item in spec.model_files
        ],
        "input_spec": {
            "temperature_input": spec.temperature_input,
            "months_required": spec.months_required,
        },
    }
