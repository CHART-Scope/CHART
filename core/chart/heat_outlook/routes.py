"""HTTP endpoint for the Kenya heat outlook."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from chart.auth.schemas import CurrentUserContext
from chart.auth.service import require_current_user
from chart.model_settings.service import outlook_restriction
from chart.risk.routes import _require_read_access as require_read_access
from chart.risk.schemas import MapResponse
from chart.risk.service import NoAdminUnitForGeography
from chart.shared.db.session import get_session_factory

from .observed import ObservedNotCalibrated, load_observed, load_observed_map
from .schemas import HeatOutlookResponse, ObservedResponse
from .service import (
    LBW_OUTCOME,
    OutlookNotAvailable,
    OutlookSelectionInvalid,
    ViewTurnedOff,
    load_outlook,
    load_outlook_map,
)

router = APIRouter(prefix="/heat-outlook", tags=["heat-outlook"])


@router.get(
    "/{geography_id}",
    response_model=HeatOutlookResponse,
    summary="Read the pre-computed heat outlook for a Kenyan place",
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
            restriction=outlook_restriction(outcome),
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
    summary="Read Kenyan counties shaded by annual-average heat share",
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
    restriction = outlook_restriction(outcome)
    try:
        with get_session_factory()() as session:
            return load_outlook_map(
                session,
                geography_id,
                outcome,
                scenario=scenario,
                period=period,
                selector=selector,
                restriction=restriction,
                reference=reference,
            )
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
    restriction = outlook_restriction(outcome)
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
    restriction = outlook_restriction(outcome)
    try:
        with get_session_factory()() as session:
            return load_observed_map(
                session,
                geography_id,
                outcome,
                month=month,
                selector=selector,
                restriction=restriction,
            )
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
