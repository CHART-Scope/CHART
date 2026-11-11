"""HTTP endpoints for heat-season calendars (Settings > Heat seasons).

Any dashboard reader may read the calendars of places they can see; saving
and resetting are for administrators (``chart_admin``).
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from chart.auth.schemas import CurrentUserContext
from chart.auth.service import require_any_role, require_current_user
from chart.risk.routes import risk_reader_roles
from chart.shared.db.session import get_session_factory

from . import service
from .schemas import HeatSeasonCalendar, HeatSeasonList, HeatSeasonUpdate

router = APIRouter(prefix="/heat-seasons", tags=["heat-seasons"])

CurrentUser = Annotated[CurrentUserContext, Depends(require_current_user)]


def _call(fn, user: CurrentUserContext, *args):
    require_any_role(user, risk_reader_roles)
    with get_session_factory()() as session:
        try:
            return fn(session, user, *args)
        except service.HeatSeasonError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.code) from exc


@router.get("", response_model=HeatSeasonList, summary="List heat-season calendars")
def list_heat_seasons(user: CurrentUser) -> HeatSeasonList:
    return HeatSeasonList(items=_call(service.list_calendars, user))


@router.get(
    "/{geography_id}",
    response_model=HeatSeasonCalendar,
    summary="Read the heat-season calendar in effect for a place",
)
def read_heat_season(geography_id: str, user: CurrentUser) -> HeatSeasonCalendar:
    return _call(service.read_calendar, user, geography_id)


@router.put(
    "/{geography_id}",
    response_model=HeatSeasonCalendar,
    summary="Save a place's own heat-season calendar",
)
def save_heat_season(
    geography_id: str, body: HeatSeasonUpdate, user: CurrentUser
) -> HeatSeasonCalendar:
    return _call(service.save_calendar, user, geography_id, body.months, body.source)


@router.delete(
    "/{geography_id}",
    response_model=HeatSeasonCalendar,
    summary="Drop a place's own calendar so it inherits again",
)
def reset_heat_season(geography_id: str, user: CurrentUser) -> HeatSeasonCalendar:
    return _call(service.reset_calendar, user, geography_id)
