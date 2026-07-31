"""HTTP endpoints for the Short-term and Long-term dashboard panels."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select

from chart.auth.schemas import CurrentUserContext
from chart.auth.service import (
    require_any_role,
    require_current_user,
    require_geography_access,
)
from chart.shared.db.models import AppGeography
from chart.shared.db.session import get_session_factory

from .schemas import (
    CurrentObservationResponse,
    LongTermRiskResponse,
    ShortTermRiskResponse,
)
from .service import (
    NoAdminUnitForGeography,
    load_current_observation,
    load_long_term_view,
    load_short_term_view,
)

router = APIRouter(prefix="/risk", tags=["risk"])


risk_reader_roles = frozenset(
    {
        "chart_admin",
        "health_planning_lead",
        "cross_sector_planning_lead",
        "health_implementation_officer",
        "cross_sector_implementation_officer",
        "public_viewer",
    }
)


def _resolve_place_path(geography_id: str) -> str:
    """Return the AppGeography.path used for scope checks.

    Deliberately does *not* require a linked admin_unit or an active
    model release, so the dashboard stays reachable for accounts whose
    onboarded geography has not yet had its admin_unit or model
    registered. The dashboard's read endpoints render their own empty
    state when no health_impact rows exist for that place.
    """

    with get_session_factory()() as session:
        path = session.scalar(
            select(AppGeography.path).where(AppGeography.id == geography_id)
        )
    if path is None:
        raise HTTPException(status_code=404, detail="GEOGRAPHY_NOT_FOUND")
    return path


def _require_read_access(user: CurrentUserContext, geography_id: str) -> None:
    require_any_role(user, risk_reader_roles)
    place_path = _resolve_place_path(geography_id)
    require_geography_access(user, place_path)


@router.get(
    "/{geography_id}/short-term",
    response_model=ShortTermRiskResponse,
    summary="Read Short-term dashboard series and horizon cards",
)
def read_short_term(
    geography_id: str,
    user: Annotated[CurrentUserContext, Depends(require_current_user)],
    admin_unit: Annotated[
        str | None, Query(min_length=1, max_length=64)
    ] = None,
) -> ShortTermRiskResponse:
    _require_read_access(user, geography_id)
    with get_session_factory()() as session:
        try:
            return load_short_term_view(session, geography_id, admin_unit)
        except NoAdminUnitForGeography as exc:
            raise HTTPException(
                status_code=404, detail="ADMIN_UNIT_NOT_FOUND"
            ) from exc


@router.get(
    "/{geography_id}/current-observation",
    response_model=CurrentObservationResponse,
    summary="Read the latest observed climate reading for the place",
)
def read_current_observation(
    geography_id: str,
    user: Annotated[CurrentUserContext, Depends(require_current_user)],
    admin_unit: Annotated[
        str | None, Query(min_length=1, max_length=64)
    ] = None,
) -> CurrentObservationResponse:
    _require_read_access(user, geography_id)
    with get_session_factory()() as session:
        try:
            return load_current_observation(session, geography_id, admin_unit)
        except NoAdminUnitForGeography as exc:
            raise HTTPException(
                status_code=404, detail="ADMIN_UNIT_NOT_FOUND"
            ) from exc


@router.get(
    "/{geography_id}/long-term",
    response_model=LongTermRiskResponse,
    summary="Read Long-term dashboard scenarios and horizon table",
)
def read_long_term(
    geography_id: str,
    user: Annotated[CurrentUserContext, Depends(require_current_user)],
    admin_unit: Annotated[
        str | None, Query(min_length=1, max_length=64)
    ] = None,
) -> LongTermRiskResponse:
    _require_read_access(user, geography_id)
    with get_session_factory()() as session:
        try:
            return load_long_term_view(session, geography_id, admin_unit)
        except NoAdminUnitForGeography as exc:
            raise HTTPException(
                status_code=404, detail="ADMIN_UNIT_NOT_FOUND"
            ) from exc
