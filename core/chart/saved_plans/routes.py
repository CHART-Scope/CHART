"""HTTP endpoints for saved plans.

Anyone with plans write at a place may save a view of it, or start a plan in
the Configure plan wizard and change it step by step. Plans are private:
a user only ever sees, opens or removes their own, and a plan for a place they
can no longer read plans at is hidden from the list and refused when opened.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Response

from chart.auth.schemas import CurrentUserContext
from chart.auth.service import require_current_user
from chart.shared.db.session import get_session_factory

from . import actions, districts, service
from .schemas import (
    PlanActions,
    PlanActionsUpdate,
    PlanDistricts,
    PlanDistrictsUpdate,
    SavedPlanCreate,
    SavedPlanList,
    SavedPlanResponse,
    SavedPlanUpdate,
)

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


@router.patch(
    "/{plan_id}",
    response_model=SavedPlanResponse,
    summary="Change a plan's name, dates, hazard or outcomes",
)
def update_saved_plan(
    plan_id: PlanId, request: SavedPlanUpdate, user: CurrentUser
) -> SavedPlanResponse:
    return _call(user, service.update_plan, plan_id, request)


@router.get(
    "/{plan_id}/districts",
    response_model=PlanDistricts,
    summary="Rank the districts beneath a plan's place",
)
def read_plan_districts(plan_id: PlanId, user: CurrentUser) -> PlanDistricts:
    return _call(user, districts.read_districts, plan_id)


@router.put(
    "/{plan_id}/districts",
    response_model=PlanDistricts,
    summary="Choose the districts a plan focuses on",
)
def save_plan_districts(
    plan_id: PlanId, request: PlanDistrictsUpdate, user: CurrentUser
) -> PlanDistricts:
    return _call(user, districts.save_districts, plan_id, request)


@router.get(
    "/{plan_id}/actions",
    response_model=PlanActions,
    summary="Rank the repository's actions for a plan",
)
def read_plan_actions(plan_id: PlanId, user: CurrentUser) -> PlanActions:
    return _call(user, actions.read_actions, plan_id)


@router.put(
    "/{plan_id}/actions",
    response_model=PlanActions,
    summary="Choose the actions a plan includes",
)
def save_plan_actions(
    plan_id: PlanId, request: PlanActionsUpdate, user: CurrentUser
) -> PlanActions:
    return _call(user, actions.save_actions, plan_id, request)


@router.delete("/{plan_id}", status_code=204, summary="Remove a saved plan")
def delete_saved_plan(plan_id: PlanId, user: CurrentUser) -> Response:
    _call(user, service.delete_plan, plan_id)
    return Response(status_code=204)
