from __future__ import annotations

import json
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, or_, select

from chart.model_registry.runtime import prepare_model_release
from chart.model_registry.schemas import ModelReleaseSpec
from chart.model_registry.service import ModelRegistryError
from chart.setup.model_configs import deployed_configs
from chart.shared.db.models import (
    ActiveModelAssignment,
    AdminUnit,
    AppGeography,
    ModelAreaMapping,
    ModelRelease,
)
from chart.shared.db.session import get_session_factory

router = APIRouter(prefix="/model-catalog", tags=["model-catalog"])
releases_router = APIRouter(prefix="/model-releases", tags=["model-releases"])


# Human-facing labels that title-casing the code alone cannot produce
# (commas, uppercase acronyms). Any code missing from these maps falls
# back to underscores-to-spaces title case. Add entries when a new model
# release introduces a code whose display form matters.
_HAZARD_LABELS: dict[str, str] = {
    "extreme_heat": "Extreme heat",
    "extreme_cold": "Extreme cold",
    "drought": "Drought",
    "flood": "Flooding",
    "wildfire": "Wildfire",
    "air_pollution": "Air pollution",
}
_DOMAIN_LABELS: dict[str, str] = {
    "maternal_newborn_child_health": "Maternal, newborn and child health",
    "respiratory_health": "Respiratory health",
    "cardiovascular_health": "Cardiovascular health",
}
_OUTCOME_LABELS: dict[str, str] = {
    "lbw": "Low birth weight",
    "preterm": "Preterm birth",
    "asthma": "Asthma exacerbation",
}


class CatalogEntry(BaseModel):
    climate_hazard: str
    climate_hazard_label: str
    health_domain: str
    health_domain_label: str
    outcome: str
    outcome_label: str
    dashboard_title: str | None = None
    population_label: str | None = None
    model_scope_label: str | None = None
    effect_measure: str | None = None
    batch_status: str | None = None
    visualization_type: str | None = None
    visualization_figure: str | None = None
    visualization_context_figure: str | None = None
    risk_description: str | None = None
    release_ids: list[str]


class CatalogResponse(BaseModel):
    items: list[CatalogEntry]


@router.get("", response_model=CatalogResponse)
def list_catalog(
    geography_id: str | None = Query(default=None),
    include_descendants: bool = Query(default=False),
) -> CatalogResponse:
    """The distinct hazard/outcome combinations backed by an active release.

    The planning UI renders these as the two dropdowns in the "we're
    planning together for the impacts of ... on ..." sentence.
    """

    with get_session_factory()() as session:
        assignment_query = select(ActiveModelAssignment.model_release_id).distinct()
        if geography_id is not None:
            selected_geography = session.get(AppGeography, geography_id)
            if selected_geography is None:
                return CatalogResponse(items=[])
            assignment_query = assignment_query.join(
                AdminUnit,
                AdminUnit.id == ActiveModelAssignment.admin_unit_id,
            ).join(
                AppGeography,
                AppGeography.id == AdminUnit.app_geography_id,
            )
            if include_descendants:
                assignment_query = assignment_query.where(
                    AppGeography.country_code == selected_geography.country_code,
                    or_(
                        AppGeography.id == selected_geography.id,
                        AppGeography.path.startswith(f"{selected_geography.path}/"),
                    ),
                )
            else:
                assignment_query = assignment_query.where(
                    AppGeography.id == selected_geography.id
                )
        active_release_ids = session.execute(assignment_query).scalars().all()
        if not active_release_ids:
            return CatalogResponse(items=[])
        rows = (
            session.execute(
                select(ModelRelease).where(ModelRelease.id.in_(active_release_ids))
            )
            .scalars()
            .all()
        )

    grouped: dict[tuple[str, str, str], list[ModelRelease]] = {}
    for release in rows:
        hazard = (release.climate_hazard or "").strip() or "unspecified"
        # health_domain is optional in the spec; when a release omits it,
        # bucket every entry under the outcome-derived domain so the UI
        # still shows a coherent pair.
        domain = (
            release.health_domain or _domain_from_outcome(release.outcome)
        ).strip()
        outcome = release.outcome.strip()
        key = (hazard, domain, outcome)
        grouped.setdefault(key, []).append(release)

    items = [
        CatalogEntry(
            climate_hazard=hazard,
            climate_hazard_label=_release_label(
                releases[0], "climate_hazard_label", hazard, _HAZARD_LABELS
            ),
            health_domain=domain,
            health_domain_label=_release_label(
                releases[0], "health_domain_label", domain, _DOMAIN_LABELS
            ),
            outcome=outcome,
            outcome_label=_release_label(
                releases[0], "outcome_label", outcome, _OUTCOME_LABELS
            ),
            dashboard_title=_presentation_value(releases[0], "dashboard_title"),
            population_label=_presentation_value(releases[0], "population_label"),
            model_scope_label=_presentation_value(releases[0], "model_scope_label"),
            effect_measure=_contract_value(releases[0], "effect_measure"),
            batch_status=_input_contract_value(releases[0], "batch_status"),
            visualization_type=_visualization_value(releases[0], "kind"),
            visualization_figure=_visualization_value(releases[0], "figure"),
            visualization_context_figure=_visualization_value(
                releases[0], "context_figure"
            ),
            risk_description=_presentation_value(releases[0], "risk_description"),
            release_ids=sorted(release.id for release in releases),
        )
        for (hazard, domain, outcome), releases in sorted(grouped.items())
    ]
    return CatalogResponse(items=items)


def _label(code: str, overrides: dict[str, str]) -> str:
    if code in overrides:
        return overrides[code]
    if not code:
        return ""
    return code.replace("_", " ").replace("-", " ").capitalize()


def _release_label(
    release: ModelRelease,
    field: str,
    code: str,
    overrides: dict[str, str],
) -> str:
    presentation = (release.input_spec or {}).get("presentation") or {}
    value = presentation.get(field)
    return (
        str(value)
        if isinstance(value, str) and value.strip()
        else _label(code, overrides)
    )


def _presentation_value(release: ModelRelease, field: str) -> str | None:
    presentation = (release.input_spec or {}).get("presentation") or {}
    value = presentation.get(field)
    return str(value) if isinstance(value, str) and value.strip() else None


def _visualization_value(release: ModelRelease, field: str) -> str | None:
    presentation = (release.input_spec or {}).get("presentation") or {}
    visualization = presentation.get("visualization") or {}
    value = visualization.get(field)
    return str(value) if isinstance(value, str) and value.strip() else None


def _contract_value(release: ModelRelease, field: str) -> str | None:
    contract = (release.input_spec or {}).get("output_contract") or {}
    value = contract.get(field)
    return str(value) if isinstance(value, str) and value.strip() else None


def _input_contract_value(release: ModelRelease, field: str) -> str | None:
    contract = (release.input_spec or {}).get("input_contract") or {}
    value = contract.get(field)
    return str(value) if isinstance(value, str) and value.strip() else None


def _domain_from_outcome(outcome: str) -> str:
    return _OUTCOME_TO_DOMAIN.get(outcome.strip(), "unspecified")


_OUTCOME_TO_DOMAIN: dict[str, str] = {
    "lbw": "maternal_newborn_child_health",
    "preterm": "maternal_newborn_child_health",
    "asthma": "respiratory_health",
}


class ModelFileInfo(BaseModel):
    filename: str
    sha256: str


class ReleaseInfo(BaseModel):
    id: str
    version: str
    outcome: str
    outcome_label: str
    climate_hazard: str | None
    climate_hazard_label: str | None
    health_domain: str | None
    health_domain_label: str | None
    status: str
    activated_at: datetime | None
    created_at: datetime
    model_files: list[ModelFileInfo]
    area_count: int
    manifest_source_path: str | None
    base_uri: str | None
    source_git_ref: str | None
    release_notes: str | None
    is_active: bool


class ReleasesResponse(BaseModel):
    items: list[ReleaseInfo]


class ReloadResponse(BaseModel):
    release_id: str
    status: str


@releases_router.get("", response_model=ReleasesResponse)
def list_releases() -> ReleasesResponse:
    """Every registered model release, active-first."""

    source_paths: dict[str, str] = {}
    for config in deployed_configs():
        try:
            spec = ModelReleaseSpec.model_validate_json(
                config.model_release.read_text(encoding="utf-8")
            )
            source_paths[spec.id] = str(config.model_release)
        except Exception:  # noqa: BLE001 - discovery best-effort
            continue

    with get_session_factory()() as session:
        active_release_ids = set(
            session.execute(
                select(ActiveModelAssignment.model_release_id).distinct()
            ).scalars()
        )
        rows = session.execute(select(ModelRelease)).scalars().all()
        area_counts: dict[str, int] = {
            release_id: count
            for release_id, count in session.execute(
                select(
                    ModelAreaMapping.model_release_id,
                    func.count(ModelAreaMapping.id),
                ).group_by(ModelAreaMapping.model_release_id)
            ).all()
        }

    items: list[ReleaseInfo] = []
    for release in rows:
        model_files = [
            ModelFileInfo(
                filename=str(entry.get("filename") or ""),
                sha256=str(entry.get("sha256") or ""),
            )
            for entry in (release.model_files or [])
            if isinstance(entry, dict)
        ]
        base_uri = None
        release_uri = release.release_file_uri or ""
        if release_uri.endswith("/model-release.json"):
            base_uri = release_uri[: -len("/model-release.json")]
        items.append(
            ReleaseInfo(
                id=release.id,
                version=release.version,
                outcome=release.outcome,
                outcome_label=_release_label(
                    release, "outcome_label", release.outcome, _OUTCOME_LABELS
                ),
                climate_hazard=release.climate_hazard,
                climate_hazard_label=(
                    _release_label(
                        release,
                        "climate_hazard_label",
                        release.climate_hazard or "",
                        _HAZARD_LABELS,
                    )
                    if release.climate_hazard
                    else None
                ),
                health_domain=release.health_domain,
                health_domain_label=(
                    _release_label(
                        release,
                        "health_domain_label",
                        release.health_domain or "",
                        _DOMAIN_LABELS,
                    )
                    if release.health_domain
                    else None
                ),
                status=release.status,
                activated_at=release.activated_at,
                created_at=release.created_at,
                model_files=model_files,
                area_count=int(area_counts.get(release.id, 0)),
                manifest_source_path=source_paths.get(release.id),
                base_uri=base_uri,
                source_git_ref=release.source_git_ref,
                release_notes=release.release_notes,
                is_active=release.id in active_release_ids,
            )
        )
    items.sort(key=lambda item: (not item.is_active, item.outcome, item.id))
    return ReleasesResponse(items=items)


@releases_router.post("/{release_id}/reload", response_model=ReloadResponse)
def reload_release(release_id: str) -> ReloadResponse:
    """Re-verify + re-warm one release into the R runtime.

    Useful after the R container restarts, or after a manifest edit that
    swaps the SHA-256 of an existing artifact. Does not touch the database.
    """

    matched_path = None
    for config in deployed_configs():
        try:
            document = json.loads(config.model_release.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if document.get("id") == release_id:
            matched_path = config.model_release
            break
    if matched_path is None:
        raise HTTPException(status_code=404, detail="MODEL_RELEASE_NOT_FOUND")
    try:
        spec = ModelReleaseSpec.model_validate_json(
            matched_path.read_text(encoding="utf-8")
        )
        prepare_model_release(spec)
    except ModelRegistryError as error:
        raise HTTPException(status_code=503, detail=error.args[0]) from error
    return ReloadResponse(release_id=release_id, status="loaded")
