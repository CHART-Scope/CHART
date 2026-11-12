"""HTTP endpoints for plan recommendations and how they are produced.

Any dashboard reader may rank actions for their own saved plans. Choosing the
ranker and the insight provider/model, and listing a provider's models, is for
``chart_admin``; credentials stay in the server environment.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path
from starlette.concurrency import run_in_threadpool

from chart.auth.schemas import CurrentUserContext
from chart.auth.service import require_any_role, require_current_user
from chart.risk.routes import risk_reader_roles
from chart.saved_plans.service import SavedPlanError
from chart.shared.db.session import get_session_factory

from . import service
from .schemas import (
    ProviderModels,
    RecommendationRequest,
    RecommendationResponse,
    RecommendationSettings,
    RecommendationSettingsResponse,
)

router = APIRouter(tags=["recommendations"])

CurrentUser = Annotated[CurrentUserContext, Depends(require_current_user)]


def _call(fn, *args):
    with get_session_factory()() as session:
        try:
            return fn(session, *args)
        except (service.RecommendationError, SavedPlanError) as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.code) from exc


@router.post(
    "/saved-plans/{plan_id}/recommendations",
    response_model=RecommendationResponse,
    summary="Rank published actions for a saved plan, with an insight",
)
async def recommend_for_plan(
    plan_id: Annotated[str, Path(min_length=36, max_length=36)],
    request: RecommendationRequest,
    user: CurrentUser,
) -> RecommendationResponse:
    require_any_role(user, risk_reader_roles)
    # A language model may take seconds; keep the event loop free.
    return await run_in_threadpool(_call, service.recommend, user, plan_id, request)


@router.get(
    "/recommendation-settings",
    response_model=RecommendationSettingsResponse,
    summary="Read how recommendations are ranked and explained",
)
def read_recommendation_settings(user: CurrentUser) -> RecommendationSettingsResponse:
    require_any_role(user, {"chart_admin"})
    return _call(service.read_settings)


@router.put(
    "/recommendation-settings",
    response_model=RecommendationSettingsResponse,
    summary="Choose the ranker and the insight provider and model",
)
def write_recommendation_settings(
    values: RecommendationSettings, user: CurrentUser
) -> RecommendationSettingsResponse:
    require_any_role(user, {"chart_admin"})
    return _call(service.update_settings, user, values)


@router.get(
    "/recommendation-settings/providers/{provider}/models",
    response_model=ProviderModels,
    summary="List the models an insight provider offers",
)
async def list_provider_models(
    provider: Annotated[str, Path(max_length=32)], user: CurrentUser
) -> ProviderModels:
    require_any_role(user, {"chart_admin"})
    try:
        return await run_in_threadpool(service.models_for, provider)
    except service.RecommendationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.code) from exc
