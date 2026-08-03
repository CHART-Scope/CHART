from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select

from chart.shared.db.models import ActiveModelAssignment, ModelRelease
from chart.shared.db.session import get_session_factory

router = APIRouter(prefix="/model-catalog", tags=["model-catalog"])


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
    release_ids: list[str]


class CatalogResponse(BaseModel):
    items: list[CatalogEntry]


@router.get("", response_model=CatalogResponse)
def list_catalog() -> CatalogResponse:
    """The distinct hazard/outcome combinations backed by an active release.

    The planning UI renders these as the two dropdowns in the "we're
    planning together for the impacts of ... on ..." sentence.
    """

    with get_session_factory()() as session:
        active_release_ids = (
            session.execute(select(ActiveModelAssignment.model_release_id).distinct())
            .scalars()
            .all()
        )
        if not active_release_ids:
            return CatalogResponse(items=[])
        rows = (
            session.execute(
                select(ModelRelease).where(ModelRelease.id.in_(active_release_ids))
            )
            .scalars()
            .all()
        )

    grouped: dict[tuple[str, str, str], list[str]] = {}
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
        grouped.setdefault(key, []).append(release.id)

    items = [
        CatalogEntry(
            climate_hazard=hazard,
            climate_hazard_label=_label(hazard, _HAZARD_LABELS),
            health_domain=domain,
            health_domain_label=_label(domain, _DOMAIN_LABELS),
            outcome=outcome,
            outcome_label=_label(outcome, _OUTCOME_LABELS),
            release_ids=sorted(release_ids),
        )
        for (hazard, domain, outcome), release_ids in sorted(grouped.items())
    ]
    return CatalogResponse(items=items)


def _label(code: str, overrides: dict[str, str]) -> str:
    if code in overrides:
        return overrides[code]
    if not code:
        return ""
    return code.replace("_", " ").replace("-", " ").capitalize()


def _domain_from_outcome(outcome: str) -> str:
    return _OUTCOME_TO_DOMAIN.get(outcome.strip(), "unspecified")


_OUTCOME_TO_DOMAIN: dict[str, str] = {
    "lbw": "maternal_newborn_child_health",
    "preterm": "maternal_newborn_child_health",
    "asthma": "respiratory_health",
}
