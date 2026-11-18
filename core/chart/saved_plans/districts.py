"""The districts a plan focuses on (Configure plan, step 3).

Districts are ranked from the same map the dashboard and the action
repository's priority areas read: the published outlook where it covers the
place, else the observed risk map. Shares at or above the elevated band are
suggested, and so is the district the plan was opened on from the
dashboard (its ``admin_unit_id``): the ranking covers the whole place the
dashboard framed, not only that district. Saving keeps each chosen district's rank and share, so the plan's
report shows the figures it was made with.
"""

from __future__ import annotations

from typing import Literal

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from chart.access.guards import can
from chart.auth.schemas import CurrentUserContext
from chart.heat_outlook.service import (
    OutlookNotAvailable,
    ViewTurnedOff,
    load_outlook_map,
)
from chart.model_settings.service import outlook_restriction
from chart.risk.schemas import MapResponse
from chart.risk.service import NoAdminUnitForGeography, load_map_view
from chart.shared.db.models import AppGeography, PlanDistrict, SavedPlan

from .schemas import PlanDistrictArea, PlanDistricts, PlanDistrictsUpdate
from .service import SavedPlanError, readable_plan, require_plan_write

#: The map's 5-10% band and up, as the action repository's priority areas.
SUGGESTED_PERCENT = 5.0

Source = Literal["projection", "observed"]


def read_districts(
    session: Session, user: CurrentUserContext, plan_id: str
) -> PlanDistricts:
    plan = readable_plan(session, user, plan_id)
    return _districts(session, user, plan)


def save_districts(
    session: Session,
    user: CurrentUserContext,
    plan_id: str,
    request: PlanDistrictsUpdate,
) -> PlanDistricts:
    plan = readable_plan(session, user, plan_id)
    require_plan_write(session, user, plan)
    source, ranked = _ranking(session, user, plan)
    by_id = {area.geography_id: area for area in ranked.areas}
    chosen = list(dict.fromkeys(request.geography_ids))
    if any(geography_id not in by_id for geography_id in chosen):
        raise SavedPlanError("PLAN_DISTRICT_INVALID", 422)
    session.execute(delete(PlanDistrict).where(PlanDistrict.plan_id == plan.id))
    session.add_all(
        PlanDistrict(
            plan_id=plan.id,
            geography_id=geography_id,
            rank=by_id[geography_id].rank,
            value_percent=by_id[geography_id].value_percent,
            suggested=by_id[geography_id].suggested,
            source=source,
        )
        for geography_id in chosen
    )
    session.commit()
    return _districts(session, user, plan)


def _districts(
    session: Session, user: CurrentUserContext, plan: SavedPlan
) -> PlanDistricts:
    source, ranked = _ranking(session, user, plan)
    saved = set(
        session.scalars(
            select(PlanDistrict.geography_id).where(PlanDistrict.plan_id == plan.id)
        )
    )
    areas = [
        area.model_copy(
            update={
                "selected": (
                    area.geography_id in saved
                    if saved
                    else area.suggested or area.geography_id == plan.admin_unit_id
                )
            }
        )
        for area in ranked.areas
    ]
    return PlanDistricts(
        plan_id=plan.id,
        outcome=_outcome(plan),
        source=source,
        month=ranked.month,
        saved=bool(saved),
        areas=areas,
    )


class _Ranked:
    def __init__(self, month: str | None, areas: list[PlanDistrictArea]) -> None:
        self.month = month
        self.areas = areas


def _ranking(
    session: Session, user: CurrentUserContext, plan: SavedPlan
) -> tuple[Source, _Ranked]:
    """Every district the user reads beneath the plan's frame, highest first."""

    place = session.get(AppGeography, plan.geography_id)
    assert place is not None  # readable_plan refused a plan whose place is gone
    outcome = _outcome(plan)
    source: Source = "projection"
    try:
        frame: MapResponse = load_outlook_map(
            session,
            place.id,
            outcome,
            restriction=outlook_restriction(outcome, country_code=place.country_code),
        )
    except (OutlookNotAvailable, ViewTurnedOff, NoAdminUnitForGeography):
        source = "observed"
        try:
            frame = load_map_view(session, place.id, None, outcome=outcome)
        except NoAdminUnitForGeography as exc:
            raise SavedPlanError("PLAN_DISTRICTS_UNAVAILABLE", 404) from exc
    paths: dict[str, str] = {
        geography_id: path
        for geography_id, path in session.execute(
            select(AppGeography.id, AppGeography.path).where(
                AppGeography.id.in_(
                    {area.geography_id for area in frame.areas if area.geography_id}
                )
            )
        )
    }
    readable = [
        area
        for area in frame.areas
        if area.geography_id in paths
        and can(user, "risk", "read", paths[area.geography_id])
    ]
    readable.sort(
        key=lambda area: (
            area.value_percent is None,
            -(area.value_percent or 0),
            area.name,
        )
    )
    areas = [
        PlanDistrictArea(
            geography_id=area.geography_id or "",
            name=area.name,
            level=area.level,
            value_percent=area.value_percent,
            missing_reason=area.missing_reason,
            rank=index + 1 if area.value_percent is not None else None,
            suggested=(area.value_percent or 0) >= SUGGESTED_PERCENT,
            selected=False,
        )
        for index, area in enumerate(readable)
    ]
    return source, _Ranked(frame.month, areas)


def _outcome(plan: SavedPlan) -> str:
    # The first outcome the plan addresses ranks its districts.
    return plan.outcomes[0] if plan.outcomes else plan.outcome
