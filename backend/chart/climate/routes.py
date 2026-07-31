from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse

from sqlalchemy import select

from chart.shared.db.models import AppGeography
from chart.shared.db.session import get_session_factory

from chart.auth.schemas import CurrentUserContext
from chart.auth.service import (
    require_any_role,
    require_current_user,
    require_geography_access,
)

from .requests import (
    get_prediction_request,
    list_prediction_requests,
    submit_prediction,
)
from .schemas import (
    ErrorResponse,
    PlaceListResponse,
    PlanningOptionsResponse,
    PredictRequest,
    PredictResponse,
    PredictionAcceptedResponse,
    PredictionRequestListResponse,
    PredictionRequestStatusResponse,
    PreviewRequest,
    PreviewResponse,
)
from .service import (
    ClimateServiceError,
    get_place_path,
    get_planning_options,
    list_locations,
    preview,
)

router = APIRouter(prefix="/climate", tags=["climate"])

prediction_roles = frozenset(
    {
        "chart_admin",
        "health_planning_lead",
        "cross_sector_planning_lead",
        "health_implementation_officer",
        "cross_sector_implementation_officer",
    }
)


@router.get(
    "/locations",
    response_model=PlaceListResponse,
    summary="List model-ready places",
)
def get_locations() -> PlaceListResponse:
    return list_locations()


@router.get(
    "/planning-options/{geography_id}",
    response_model=PlanningOptionsResponse,
    summary="Resolve available planning dates for one place",
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def get_place_planning_options(
    geography_id: str,
    user: Annotated[CurrentUserContext, Depends(require_current_user)],
) -> PlanningOptionsResponse:
    try:
        _require_place_access(user, geography_id)
        return get_planning_options(geography_id)
    except ClimateServiceError as error:
        raise _http_error(error) from error


@router.post(
    "/preview",
    response_model=PreviewResponse,
    summary="Show the three climate records for a planning month",
    responses={
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
    },
)
def post_preview(
    request: PreviewRequest,
    user: Annotated[CurrentUserContext, Depends(require_current_user)],
) -> PreviewResponse:
    try:
        _require_place_access(user, request.geography_id)
        return preview(request)
    except ClimateServiceError as error:
        raise _http_error(error) from error


@router.post(
    "/predict",
    response_model=PredictResponse | PredictionAcceptedResponse,
    summary="Queue a traceable planning prediction",
    responses={
        202: {"model": PredictionAcceptedResponse},
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
    },
)
def post_predict(
    request: PredictRequest,
    user: Annotated[CurrentUserContext, Depends(require_current_user)],
) -> PredictResponse | JSONResponse:
    try:
        _require_place_access(user, request.geography_id)
        result = submit_prediction(request, requested_by_user_id=user.user_id)
        if isinstance(result, PredictionAcceptedResponse):
            return JSONResponse(
                status_code=202,
                content=result.model_dump(mode="json"),
                headers={"Retry-After": "3"},
            )
        return result
    except ClimateServiceError as error:
        raise _http_error(error) from error


@router.get(
    "/prediction-requests",
    response_model=PredictionRequestListResponse,
    summary="List the signed-in user's recent prediction runs",
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def get_prediction_requests(
    geography_id: str,
    user: Annotated[CurrentUserContext, Depends(require_current_user)],
    limit: Annotated[int, Query(ge=1, le=25)] = 10,
) -> PredictionRequestListResponse:
    try:
        _require_geography_only_access(user, geography_id)
        return list_prediction_requests(
            requested_by_user_id=user.user_id,
            geography_id=geography_id,
            limit=limit,
        )
    except ClimateServiceError as error:
        raise _http_error(error) from error


@router.get(
    "/prediction-requests/{request_id}",
    response_model=PredictionRequestStatusResponse,
    summary="Read climate preparation and prediction status",
    responses={
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
    },
)
def get_prediction_request_status(
    request_id: int,
    user: Annotated[CurrentUserContext, Depends(require_current_user)],
) -> PredictionRequestStatusResponse:
    try:
        status = get_prediction_request(request_id, requested_by_user_id=user.user_id)
        _require_place_access(user, status.geography_id)
        return status
    except ClimateServiceError as error:
        raise _http_error(error) from error


def _require_place_access(user: CurrentUserContext, geography_id: str) -> None:
    require_any_role(user, prediction_roles)
    require_geography_access(user, get_place_path(geography_id))


def _require_geography_only_access(
    user: CurrentUserContext, geography_id: str
) -> None:
    """Guard for endpoints that need scope but not a configured admin_unit.

    ``get_place_path`` walks AppGeography -> admin_unit -> active model
    release and raises 409 CLIMATE_NOT_CONFIGURED_FOR_PLACE if any link
    is missing. Read-only listings do not need any of that; they just
    need the caller to have a role and a matching geography scope.
    """

    require_any_role(user, prediction_roles)
    with get_session_factory()() as session:
        path = session.scalar(
            select(AppGeography.path).where(AppGeography.id == geography_id)
        )
    if path is None:
        raise ClimateServiceError("GEOGRAPHY_NOT_FOUND", 404)
    require_geography_access(user, path)


def _http_error(error: ClimateServiceError) -> HTTPException:
    return HTTPException(status_code=error.status_code, detail=error.code)
