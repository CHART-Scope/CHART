from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import cast

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from chart.shared.db.models import (
    ActiveModelAssignment,
    AdminUnit,
    AppGeography,
    ModelAreaMapping,
    ModelRelease,
)

from .schemas import ModelReleaseSpec, PregnancyWindow

logger = logging.getLogger(__name__)


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
    outcome: str = "lbw"
    input_spec: dict | None = None


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
            or _model_file_identities(existing.model_files)
            != _model_file_identities(payload["model_files"])
            or not _input_spec_is_compatible(
                existing.input_spec or {}, payload["input_spec"]
            )
            or not _area_mappings_match(existing, spec, admin_units)
        ):
            raise ModelRegistryError("MODEL_RELEASE_IMMUTABLE", spec.id)
        # The URI is where the file lives, not what the file is. Update it in
        # place when the manifest's base_uri moves (e.g. bucket rename) so
        # the DB reflects the current source without needing a new version.
        if existing.model_files != payload["model_files"]:
            existing.model_files = payload["model_files"]
            existing.release_file_uri = (
                f"{spec.base_uri.rstrip('/')}/model-release.json"
            )
        merged_input_spec = _merge_additive_presentation(
            existing.input_spec or {}, payload["input_spec"]
        )
        if merged_input_spec != existing.input_spec:
            # editorial_reference_temperature_c re-anchors the R DLNM, so
            # a change here silently shifts every subsequent OR/CI on the
            # same release id. Log it loudly so operators can spot the
            # rewrite in the audit stream without needing to diff the
            # manifest by hand.
            _warn_if_editorial_anchor_changed(
                existing.input_spec or {}, merged_input_spec, spec.id
            )
            existing.input_spec = merged_input_spec
        # Taxonomy fields are late additions: backfill on re-register so
        # older rows pick up hazard/domain from the manifest without
        # forcing a new release version.
        if spec.climate_hazard and existing.climate_hazard != spec.climate_hazard:
            existing.climate_hazard = spec.climate_hazard
        if spec.health_domain and existing.health_domain != spec.health_domain:
            existing.health_domain = spec.health_domain
        if activate:
            activate_release(session, existing)
            session.flush()
        return existing

    release = ModelRelease(
        id=spec.id,
        module=spec.module,
        outcome=spec.outcome,
        version=spec.version,
        status="validated" if model_dir is not None else "uploaded",
        climate_hazard=spec.climate_hazard,
        health_domain=spec.health_domain,
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
                validated_pregnancy_windows=list(
                    area.validated_pregnancy_windows or ()
                ),
            )
        )

    if activate:
        activate_release(session, release)
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
        outcome=release.outcome,
        input_spec=release.input_spec,
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
            outcome=release.outcome,
            input_spec=release.input_spec,
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
        outcome=release.outcome,
        input_spec=release.input_spec,
    )


def list_family_roots_with_active_models(session: Session) -> list[str]:
    """Return one path per top-level geography that has an active model release.

    Example: an active release on `/india/madhya-pradesh/indore` collapses to
    `/india`. Used by the auth layer to widen an operator's context switcher
    to every family present in the installation.
    """

    paths = (
        session.execute(
            select(AppGeography.path)
            .join(AdminUnit, AdminUnit.app_geography_id == AppGeography.id)
            .join(
                ActiveModelAssignment,
                ActiveModelAssignment.admin_unit_id == AdminUnit.id,
            )
            .distinct()
        )
        .scalars()
        .all()
    )
    roots: set[str] = set()
    for path in paths:
        parts = [segment for segment in (path or "").split("/") if segment]
        if parts:
            roots.add(f"/{parts[0]}")
    return sorted(roots)


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
            outcome=release.outcome,
            input_spec=release.input_spec,
        )
        for release, mapping in rows
        if (release.id, mapping.admin_unit_id) in keys
    }


def _validated_pregnancy_windows(
    mapping: ModelAreaMapping,
) -> tuple[PregnancyWindow, ...]:
    raw_windows = tuple(mapping.validated_pregnancy_windows or ())
    if len(set(raw_windows)) != len(raw_windows) or any(
        type(window) is not int or window not in (1, 2, 3) for window in raw_windows
    ):
        raise ModelRegistryError(
            "MODEL_RELEASE_PREGNANCY_WINDOWS_INVALID",
            f"{mapping.model_release_id}:{mapping.admin_unit_id}",
        )
    return cast(tuple[PregnancyWindow, ...], raw_windows)


def activate_release(session: Session, release: ModelRelease) -> None:
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
    release_contract = (release.input_spec or {}).get("input_contract") or {}
    superseded_release_ids = set(release_contract.get("supersedes_release_ids") or [])
    if superseded_release_ids:
        stale_assignment_ids = list(
            session.scalars(
                select(ActiveModelAssignment.admin_unit_id)
                .join(
                    ModelRelease,
                    ModelRelease.id == ActiveModelAssignment.model_release_id,
                )
                .where(
                    ActiveModelAssignment.model_release_id.in_(superseded_release_ids),
                    ActiveModelAssignment.admin_unit_id.not_in(admin_unit_ids),
                    ModelRelease.module == release.module,
                    ModelRelease.outcome == release.outcome,
                )
            )
        )
        if stale_assignment_ids:
            session.execute(
                delete(ActiveModelAssignment).where(
                    ActiveModelAssignment.admin_unit_id.in_(stale_assignment_ids),
                    ActiveModelAssignment.module == release.module,
                    ActiveModelAssignment.outcome == release.outcome,
                )
            )
        replaced_release_ids.update(superseded_release_ids)
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
            tuple(area.validated_pregnancy_windows or ()),
        )
        for area in spec.areas
    }
    return current == expected


def _model_file_identities(model_files: list[dict]) -> list[tuple[str, str]]:
    """Content-identifying tuple per file. The URI is deliberately excluded
    so a bucket-only move never trips the immutability check."""

    return sorted((entry["filename"], entry["sha256"]) for entry in model_files)


def _input_spec_is_compatible(current: dict, expected: dict) -> bool:
    """Permit presentation revisions on an existing release.

    Runtime, model input, and model output contracts remain immutable —
    those determine what the scorer is and what it returns. Presentation
    is UI metadata (labels, icons, editorial reference anchors) and the
    latest manifest is the source of truth: values may update as well as
    be added. Otherwise a label rebrand or figure swap would force every
    caller to bump the release id even though the fitted parameters and
    output shape are unchanged.
    """

    for key in ("input_contract", "output_contract", "runtime"):
        if current.get(key) != expected.get(key):
            return False
    return True


def _merge_additive_presentation(current: dict, expected: dict) -> dict:
    """Overlay the manifest's presentation onto the stored one.

    Fields present in the manifest override the stored value; fields the
    manifest omits are preserved (so a partial manifest can add without
    dropping earlier UI copy). Nested dicts are merged recursively with
    the same rule.
    """

    merged = dict(current)
    current_presentation = current.get("presentation") or {}
    expected_presentation = expected.get("presentation") or {}
    merged["presentation"] = _overlay_mappings(
        current_presentation, expected_presentation
    )
    return merged


def _warn_if_editorial_anchor_changed(
    before: dict, after: dict, release_id: str
) -> None:
    """Log when editorial_reference_temperature_c changes on re-register.

    The manifest field is stored under presentation, so the loosened
    compatibility check allows it to be overwritten without a new
    release id. That is a scoring-visible change (the R adapter uses it
    as the crosspred anchor) — surface it in the log stream so operators
    can trace why the same release_id now returns different odds.
    """

    def _anchor(spec: dict) -> object:
        return (spec.get("presentation") or {}).get("editorial_reference_temperature_c")

    old = _anchor(before)
    new = _anchor(after)
    if old != new:
        logger.warning(
            "model_release: editorial_reference_temperature_c changed on "
            "release=%s (was %r, now %r). Scoring output will shift for "
            "the same release id; consider bumping the release id if this "
            "was not intentional.",
            release_id,
            old,
            new,
        )


def _overlay_mappings(current: dict, expected: dict) -> dict:
    """Recursive overlay with a "None never clobbers a real value" rule.

    Two dicts merge recursively (nested overlay). Two scalars replace
    (latest wins). A dict on either side vs. an explicit ``None`` on the
    other is treated as a noop — a partial manifest cannot silently
    wipe a stored subtree by omitting it (Pydantic serialises absent
    optional fields as ``None``), which would otherwise erase the
    visualization block or editorial_reference_temperature_c on any
    re-register.
    """

    merged = dict(current)
    for key, value in expected.items():
        current_value = merged.get(key)
        if value is None and current_value is not None:
            continue
        if isinstance(value, dict) and isinstance(current_value, dict):
            merged[key] = _overlay_mappings(current_value, value)
        else:
            merged[key] = value
    return merged


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
            "input_contract": (
                {
                    "temperature_input": spec.temperature_input,
                    "months_required": spec.months_required,
                }
                if spec.temperature_input is not None
                else spec.input_contract
            ),
            "output_contract": spec.output_contract,
            "presentation": (
                spec.presentation.model_dump(mode="json")
                if spec.presentation is not None
                else None
            ),
            "runtime": (
                spec.runtime.model_dump(mode="json")
                if spec.runtime is not None
                else None
            ),
        },
    }
