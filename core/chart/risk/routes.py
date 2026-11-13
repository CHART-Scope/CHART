"""HTTP endpoints for the Short-term and Long-term dashboard panels."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select

from chart.access.guards import can, covers, require_capability
from chart.auth.schemas import CurrentUserContext
from chart.auth.service import require_current_user
from chart.shared.db.models import AppGeography
from chart.shared.db.session import get_session_factory

from chart.shared.outcomes import DEFAULT_OUTCOME

from .schemas import (
    CurrentObservationResponse,
    LongTermRiskResponse,
    ShortTermRiskResponse,
    MonthlyRiskResponse,
    MapResponse,
)
from .service import (
    NoAdminUnitForGeography,
    load_current_observation,
    load_long_term_view,
    load_short_term_view,
    load_monthly_view,
    load_map_view,
)

router = APIRouter(prefix="/risk", tags=["risk"])


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


def _require_read_access(
    user: CurrentUserContext, geography_id: str, admin_unit: str | None = None
) -> None:
    """Read access to the place, and to the area picked beneath it.

    A place above one's grants is readable for its own figures; an area
    picked beneath it (``admin_unit``, an AppGeography id) must be readable
    itself, or a district officer could read the district next door.
    """
    require_capability(user, "risk", "read", _resolve_place_path(geography_id))
    if admin_unit is None:
        return
    with get_session_factory()() as session:
        path = session.scalar(
            select(AppGeography.path).where(AppGeography.id == admin_unit)
        )
    # Not a geography id: the legacy area code, resolved inside the place.
    if path is not None:
        require_capability(user, "risk", "read", path)


def _readable_areas(user: CurrentUserContext, geography_id: str, result):
    """Reading a place above one's grants shows the areas one reads, not the
    detail of the areas beside them."""
    if covers(user, "risk", _resolve_place_path(geography_id)):
        return result
    with get_session_factory()() as session:
        paths: dict[str, str] = {
            id_: path
            for id_, path in session.execute(
                select(AppGeography.id, AppGeography.path).where(
                    AppGeography.id.in_(
                        {a.geography_id for a in result.areas if a.geography_id}
                    )
                )
            )
        }
    result.areas = [
        area
        for area in result.areas
        if area.geography_id in paths
        and can(user, "risk", "read", paths[area.geography_id])
    ]
    return result


@router.get(
    "/{geography_id}/monthly",
    response_model=MonthlyRiskResponse,
    summary="Read month-keyed ERA5 mean daily maxima and attributable impacts",
)
def read_monthly(
    geography_id: str,
    user: Annotated[CurrentUserContext, Depends(require_current_user)],
    month: Annotated[
        str | None,
        Query(
            pattern=r"^([1-9][0-9]{3}|0[1-9][0-9]{2}|00[1-9][0-9]|000[1-9])-(0[1-9]|1[0-2])$"
        ),
    ] = None,
    outcome: str = DEFAULT_OUTCOME,
) -> MonthlyRiskResponse:
    _require_read_access(user, geography_id)
    with get_session_factory()() as session:
        return load_monthly_view(
            session,
            geography_id,
            month,
            user_id=user.user_id,
            outcome=outcome,
        )


@router.get(
    "/{geography_id}/map",
    response_model=MapResponse,
    summary="Read administrative areas shaded by attributable fraction",
)
def read_map(
    geography_id: str,
    user: Annotated[CurrentUserContext, Depends(require_current_user)],
    month: Annotated[
        str | None,
        Query(
            pattern=r"^([1-9][0-9]{3}|0[1-9][0-9]{2}|00[1-9][0-9]|000[1-9])-(0[1-9]|1[0-2])$"
        ),
    ] = None,
    outcome: str = DEFAULT_OUTCOME,
) -> MapResponse:
    """Every area beneath this geography, with a value where one exists.

    Areas with no fitted model and areas whose month has not been computed are
    returned with a null value and a stated reason rather than omitted, so the
    map can draw them as absent rather than as safe.
    """
    _require_read_access(user, geography_id)
    with get_session_factory()() as session:
        try:
            result = load_map_view(session, geography_id, month, outcome=outcome)
        except NoAdminUnitForGeography as exc:
            raise HTTPException(status_code=404, detail="GEOGRAPHY_NOT_FOUND") from exc
    return _readable_areas(user, geography_id, result)


@router.get(
    "/{geography_id}/short-term",
    response_model=ShortTermRiskResponse,
    summary="Read Short-term dashboard series and horizon cards",
)
def read_short_term(
    geography_id: str,
    user: Annotated[CurrentUserContext, Depends(require_current_user)],
    admin_unit: Annotated[str | None, Query(min_length=1, max_length=64)] = None,
) -> ShortTermRiskResponse:
    _require_read_access(user, geography_id, admin_unit)
    with get_session_factory()() as session:
        try:
            return load_short_term_view(session, geography_id, admin_unit)
        except NoAdminUnitForGeography as exc:
            raise HTTPException(status_code=404, detail="ADMIN_UNIT_NOT_FOUND") from exc


@router.get(
    "/{geography_id}/current-observation",
    response_model=CurrentObservationResponse,
    summary="Read the latest observed climate reading for the place",
)
def read_current_observation(
    geography_id: str,
    user: Annotated[CurrentUserContext, Depends(require_current_user)],
    admin_unit: Annotated[str | None, Query(min_length=1, max_length=64)] = None,
) -> CurrentObservationResponse:
    _require_read_access(user, geography_id, admin_unit)
    with get_session_factory()() as session:
        try:
            return load_current_observation(session, geography_id, admin_unit)
        except NoAdminUnitForGeography as exc:
            raise HTTPException(status_code=404, detail="ADMIN_UNIT_NOT_FOUND") from exc


@router.get(
    "/{geography_id}/long-term",
    response_model=LongTermRiskResponse,
    summary="Read Long-term dashboard scenarios and horizon table",
)
def read_long_term(
    geography_id: str,
    user: Annotated[CurrentUserContext, Depends(require_current_user)],
    admin_unit: Annotated[str | None, Query(min_length=1, max_length=64)] = None,
) -> LongTermRiskResponse:
    _require_read_access(user, geography_id, admin_unit)
    with get_session_factory()() as session:
        try:
            return load_long_term_view(session, geography_id, admin_unit)
        except NoAdminUnitForGeography as exc:
            raise HTTPException(status_code=404, detail="ADMIN_UNIT_NOT_FOUND") from exc
