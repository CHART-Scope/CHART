"""HTTP endpoints for the Short-term and Long-term dashboard panels."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from chart.auth.schemas import CurrentUserContext
from chart.auth.service import (
    require_any_role,
    require_current_user,
    require_geography_access,
)
from chart.climate.service import ClimateServiceError, get_place_path
from chart.shared.db.session import get_session_factory

from .schemas import LongTermRiskResponse, ShortTermRiskResponse
from .service import (
    NoAdminUnitForGeography,
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


def _require_read_access(user: CurrentUserContext, geography_id: str) -> None:
    require_any_role(user, risk_reader_roles)
    try:
        place_path = get_place_path(geography_id)
    except ClimateServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.code) from exc
    require_geography_access(user, place_path)


@router.get(
    "/{geography_id}/short-term",
    response_model=ShortTermRiskResponse,
    summary="Read Short-term dashboard series and horizon cards",
)
def read_short_term(
    geography_id: str,
    admin_unit: Annotated[str, Query(min_length=1, max_length=64)],
    user: Annotated[CurrentUserContext, Depends(require_current_user)],
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
    "/{geography_id}/long-term",
    response_model=LongTermRiskResponse,
    summary="Read Long-term dashboard scenarios and horizon table",
)
def read_long_term(
    geography_id: str,
    admin_unit: Annotated[str, Query(min_length=1, max_length=64)],
    user: Annotated[CurrentUserContext, Depends(require_current_user)],
) -> LongTermRiskResponse:
    _require_read_access(user, geography_id)
    with get_session_factory()() as session:
        try:
            return load_long_term_view(session, geography_id, admin_unit)
        except NoAdminUnitForGeography as exc:
            raise HTTPException(
                status_code=404, detail="ADMIN_UNIT_NOT_FOUND"
            ) from exc
