"""HTTP endpoint for the Kenya heat outlook."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from chart.auth.schemas import CurrentUserContext
from chart.auth.service import require_current_user
from chart.risk.routes import _require_read_access as require_read_access
from chart.risk.schemas import MapResponse
from chart.risk.service import NoAdminUnitForGeography
from chart.shared.db.session import get_session_factory

from .schemas import HeatOutlookResponse
from .service import (
    LBW_OUTCOME,
    OutlookNotAvailable,
    OutlookSelectionInvalid,
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
        )
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
) -> MapResponse:
    require_read_access(user, geography_id)
    try:
        with get_session_factory()() as session:
            return load_outlook_map(
                session,
                geography_id,
                outcome,
                scenario=scenario,
                period=period,
                selector=selector,
            )
    except (OutlookNotAvailable, NoAdminUnitForGeography) as exc:
        raise HTTPException(status_code=404, detail="OUTLOOK_NOT_PUBLISHED") from exc
    except OutlookSelectionInvalid as exc:
        raise HTTPException(
            status_code=422, detail="OUTLOOK_SELECTION_INVALID"
        ) from exc
