"""HTTP endpoints for saved plans.

Anyone with plans write at a place may save a view of it. Plans are private:
a user only ever sees, opens or removes their own, and a plan for a place they
can no longer read plans at is hidden from the list and refused when opened.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Response

from chart.auth.schemas import CurrentUserContext
from chart.auth.service import require_current_user
from chart.shared.db.session import get_session_factory

from . import service
from .schemas import SavedPlanCreate, SavedPlanList, SavedPlanResponse

router = APIRouter(prefix="/saved-plans", tags=["saved-plans"])

CurrentUser = Annotated[CurrentUserContext, Depends(require_current_user)]
PlanId = Annotated[str, Path(min_length=36, max_length=36)]


def _call(user: CurrentUserContext, fn, *args):
    with get_session_factory()() as session:
        try:
            return fn(session, user, *args)
        except service.SavedPlanError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.code) from exc


@router.get("", response_model=SavedPlanList, summary="List the user's saved plans")
def list_saved_plans(user: CurrentUser) -> SavedPlanList:
    return SavedPlanList(items=_call(user, service.list_plans))


@router.post(
    "",
    response_model=SavedPlanResponse,
    status_code=201,
    summary="Save a dashboard view with its published estimate",
)
def create_saved_plan(request: SavedPlanCreate, user: CurrentUser) -> SavedPlanResponse:
    return _call(user, service.create_plan, request)


@router.get(
    "/{plan_id}", response_model=SavedPlanResponse, summary="Open one saved plan"
)
def read_saved_plan(plan_id: PlanId, user: CurrentUser) -> SavedPlanResponse:
    return _call(user, service.get_plan, plan_id)


@router.delete("/{plan_id}", status_code=204, summary="Remove a saved plan")
def delete_saved_plan(plan_id: PlanId, user: CurrentUser) -> Response:
    _call(user, service.delete_plan, plan_id)
    return Response(status_code=204)
