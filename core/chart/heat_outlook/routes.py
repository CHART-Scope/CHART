"""HTTP endpoint for the Kenya heat outlook."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from chart.auth.schemas import CurrentUserContext
from chart.auth.service import require_current_user, can_read_geography_path
from chart.model_settings.service import outlook_restriction
from chart.risk.routes import _require_read_access as require_read_access
from chart.risk.schemas import MapResponse
from chart.risk.service import NoAdminUnitForGeography
from chart.shared.db.session import get_session_factory
from chart.shared.db.models import AppGeography
from sqlalchemy import select

from .observed import ObservedNotCalibrated, load_observed, load_observed_map
from .schemas import HeatOutlookResponse, ObservedResponse
from .service import (
    LBW_OUTCOME,
    _document,
    enabled_views,
    published_index,
    OutlookNotAvailable,
    OutlookSelectionInvalid,
    ViewTurnedOff,
    load_outlook,
    load_outlook_map,
)

router = APIRouter(prefix="/heat-outlook", tags=["heat-outlook"])


def _restriction(geography_id: str, outcome: str):
    item = published_index().get(geography_id)
    if item is not None:
        return outlook_restriction(outcome, country_code=item["country_code"])
    return outlook_restriction(outcome)


@router.get("/{geography_id}/capabilities")
def capabilities(
    geography_id: str,
    user: Annotated[CurrentUserContext, Depends(require_current_user)],
    outcome: str = LBW_OUTCOME,
):
    require_read_access(user, geography_id)
    found = _document(geography_id, outcome)
    if found is None:
        if outcome in published_index().get(geography_id, {}).get("outcomes", []):
            raise HTTPException(status_code=404, detail="OUTLOOK_NOT_PUBLISHED")
        return {"published": False, "data_modes": []}
    restriction = _restriction(geography_id, outcome)
    modes = [
        v
        for v in found[0].get("data_modes", ["observed", "projection"])
        if v in enabled_views(restriction)
    ]
    return {"published": True, "data_modes": modes, "level": found[0]["level"]}


def _scoped_map(session, frame, user):
    paths = dict(session.execute(select(AppGeography.id, AppGeography.path)).all())
    frame.areas = [
        area
        for area in frame.areas
        if area.geography_id in paths
        and can_read_geography_path(user, paths[area.geography_id])
    ]
    return frame


@router.get(
    "/{geography_id}",
    response_model=HeatOutlookResponse,
    summary="Read a published geography heat outlook",
)
def read_heat_outlook(
    geography_id: str,
    user: Annotated[CurrentUserContext, Depends(require_current_user)],
    outcome: str = LBW_OUTCOME,
    scenario: Annotated[str | None, Query(max_length=16)] = None,
    period: Annotated[str | None, Query(max_length=16)] = None,
    selector: Annotated[str | None, Query(max_length=32)] = None,
) -> HeatOutlookResponse:
    require_read_access(user, geography_id)
    try:
        return load_outlook(
            geography_id,
            outcome,
            scenario=scenario,
            period=period,
            selector=selector,
            restriction=_restriction(geography_id, outcome),
        )
    except ViewTurnedOff as exc:
        raise HTTPException(status_code=404, detail="VIEW_TURNED_OFF") from exc
    except OutlookNotAvailable as exc:
        raise HTTPException(status_code=404, detail="OUTLOOK_NOT_PUBLISHED") from exc
    except OutlookSelectionInvalid as exc:
        raise HTTPException(
            status_code=422, detail="OUTLOOK_SELECTION_INVALID"
        ) from exc


@router.get(
    "/{geography_id}/map",
    response_model=MapResponse,
    summary="Read administrative areas shaded by annual-average heat share",
)
def read_heat_outlook_map(
    geography_id: str,
    user: Annotated[CurrentUserContext, Depends(require_current_user)],
    outcome: str = LBW_OUTCOME,
    scenario: Annotated[str | None, Query(max_length=16)] = None,
    period: Annotated[str | None, Query(max_length=16)] = None,
    selector: Annotated[str | None, Query(max_length=32)] = None,
    reference: Annotated[str, Query(pattern="^(annual|peak)$")] = "annual",
) -> MapResponse:
    require_read_access(user, geography_id)
    restriction = _restriction(geography_id, outcome)
    try:
        with get_session_factory()() as session:
            frame = load_outlook_map(
                session,
                geography_id,
                outcome,
                scenario=scenario,
                period=period,
                selector=selector,
                restriction=restriction,
                reference=reference,
            )
            return _scoped_map(session, frame, user)
    except ViewTurnedOff as exc:
        raise HTTPException(status_code=404, detail="VIEW_TURNED_OFF") from exc
    except (OutlookNotAvailable, NoAdminUnitForGeography) as exc:
        raise HTTPException(status_code=404, detail="OUTLOOK_NOT_PUBLISHED") from exc
    except OutlookSelectionInvalid as exc:
        raise HTTPException(
            status_code=422, detail="OUTLOOK_SELECTION_INVALID"
        ) from exc


@router.get(
    "/{geography_id}/observed",
    response_model=ObservedResponse,
    summary="Score an observed month for a Kenyan place from ERA5",
)
def read_observed(
    geography_id: str,
    user: Annotated[CurrentUserContext, Depends(require_current_user)],
    outcome: str = LBW_OUTCOME,
    month: Annotated[str | None, Query(pattern=r"^\d{4}-\d{2}$")] = None,
    selector: Annotated[str | None, Query(max_length=32)] = None,
) -> ObservedResponse:
    require_read_access(user, geography_id)
    restriction = _restriction(geography_id, outcome)
    found = _document(geography_id, outcome)
    if (found is None and geography_id in published_index()) or (
        found is not None and "observed" not in found[0].get("data_modes", ["observed"])
    ):
        raise HTTPException(status_code=404, detail="OBSERVED_NOT_AVAILABLE")
    try:
        with get_session_factory()() as session:
            return load_observed(
                session,
                geography_id,
                outcome,
                month=month,
                selector=selector,
                restriction=restriction,
            )
    except ViewTurnedOff as exc:
        raise HTTPException(status_code=404, detail="VIEW_TURNED_OFF") from exc
    except (OutlookNotAvailable, ObservedNotCalibrated) as exc:
        raise HTTPException(status_code=404, detail="OBSERVED_NOT_AVAILABLE") from exc
    except OutlookSelectionInvalid as exc:
        raise HTTPException(
            status_code=422, detail="OUTLOOK_SELECTION_INVALID"
        ) from exc


@router.get(
    "/{geography_id}/observed/map",
    response_model=MapResponse,
    summary="Read Kenyan counties shaded by an observed month's heat share",
)
def read_observed_map(
    geography_id: str,
    user: Annotated[CurrentUserContext, Depends(require_current_user)],
    outcome: str = LBW_OUTCOME,
    month: Annotated[str | None, Query(pattern=r"^\d{4}-\d{2}$")] = None,
    selector: Annotated[str | None, Query(max_length=32)] = None,
) -> MapResponse:
    require_read_access(user, geography_id)
    restriction = _restriction(geography_id, outcome)
    found = _document(geography_id, outcome)
    if (found is None and geography_id in published_index()) or (
        found is not None and "observed" not in found[0].get("data_modes", ["observed"])
    ):
        raise HTTPException(status_code=404, detail="OBSERVED_NOT_AVAILABLE")
    try:
        with get_session_factory()() as session:
            frame = load_observed_map(
                session,
                geography_id,
                outcome,
                month=month,
                selector=selector,
                restriction=restriction,
            )
            return _scoped_map(session, frame, user)
    except ViewTurnedOff as exc:
        raise HTTPException(status_code=404, detail="VIEW_TURNED_OFF") from exc
    except (
        OutlookNotAvailable,
        ObservedNotCalibrated,
        NoAdminUnitForGeography,
    ) as exc:
        raise HTTPException(status_code=404, detail="OBSERVED_NOT_AVAILABLE") from exc
    except OutlookSelectionInvalid as exc:
        raise HTTPException(
            status_code=422, detail="OUTLOOK_SELECTION_INVALID"
        ) from exc
