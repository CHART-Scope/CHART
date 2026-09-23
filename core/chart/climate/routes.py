from __future__ import annotations

from typing import Annotated

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

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
    WhatIfRequest,
    WhatIfResponse,
)
from .service import (
    ClimateServiceError,
    get_place_path,
    get_planning_options,
    list_locations,
    preview,
)
from .ingestion_jobs import (
    CountryCoverage,
    IngestionJobView,
    create_job,
    list_jobs,
    load_coverage,
)
from .what_if import score_what_if

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
    return list_locations(include_unsupported=False)


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


@router.post(
    "/what-if",
    response_model=WhatIfResponse,
    summary="Score a slider-driven temperature scenario against an active model",
    responses={
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
        502: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
)
def post_what_if(
    request: WhatIfRequest,
    user: Annotated[CurrentUserContext, Depends(require_current_user)],
) -> WhatIfResponse:
    try:
        _require_place_access(user, request.geography_id)
        return score_what_if(
            geography_id=request.geography_id,
            temperature_c=request.temperature_c,
            outcome=request.outcome,
        )
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


def _require_geography_only_access(user: CurrentUserContext, geography_id: str) -> None:
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


class IngestionJobRequest(BaseModel):
    """Ask for one country's climate data.

    Months are optional: omitted, the last twelve complete months are used,
    which is the range the dashboard's picker opens on.
    """

    country_code: str = Field(min_length=2, max_length=8)
    months: list[str] = Field(default_factory=list)


@router.get(
    "/coverage",
    response_model=list[CountryCoverage],
    summary="Read which places already hold climate data",
)
def read_coverage(
    user: Annotated[CurrentUserContext, Depends(require_current_user)],
) -> list[CountryCoverage]:
    """Per country and per area: how many months of observations are held."""
    require_any_role(user, {"chart_admin"})
    with get_session_factory()() as session:
        return load_coverage(session)


@router.post(
    "/ingestion-jobs",
    response_model=IngestionJobView,
    status_code=202,
    summary="Queue one country-wide climate pull",
)
def create_ingestion_job(
    request: IngestionJobRequest,
    user: Annotated[CurrentUserContext, Depends(require_current_user)],
) -> IngestionJobView:
    """Queue the pull and return immediately; progress is read by polling.

    Accepted rather than performed: a pull takes minutes and the web proxy
    times out after fifteen seconds. A country already pulling hands back the
    job in flight rather than starting a second download of the same grid.
    """
    require_any_role(user, {"chart_admin"})
    months = _requested_months(request.months)
    with get_session_factory()() as session:
        job, _created = create_job(
            session,
            country_code=request.country_code.upper(),
            months=months,
            requested_by_user_id=user.user_id,
        )
        view = IngestionJobView.model_validate(job, from_attributes=True)
        session.commit()
    return view


@router.get(
    "/ingestion-jobs",
    response_model=list[IngestionJobView],
    summary="Read recent climate pulls and their progress",
)
def read_ingestion_jobs(
    user: Annotated[CurrentUserContext, Depends(require_current_user)],
    country_code: str | None = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> list[IngestionJobView]:
    """Newest first, so a caller can poll the one it just created."""
    require_any_role(user, {"chart_admin"})
    with get_session_factory()() as session:
        return list_jobs(
            session,
            country_code=country_code.upper() if country_code else None,
            limit=limit,
        )


#: ERA5 monthly fields appear in the first days of the month after the one
#: they cover. "A few days in arrears" therefore rules out the month in
#: progress *and*, early in a month, the one that has just ended: asking for
#: it in the first week returns nothing and fails the job.
ERA5_PUBLICATION_LAG_DAYS = 6


def newest_complete_month(today: date) -> date:
    """The newest month ERA5 can actually be expected to have published."""
    previous = (date(today.year, today.month, 1) - timedelta(days=1)).replace(day=1)
    if today.day <= ERA5_PUBLICATION_LAG_DAYS:
        return (previous - timedelta(days=1)).replace(day=1)
    return previous


def _requested_months(raw: list[str]) -> list[date]:
    """Parse "YYYY-MM" strings, or default to the last twelve complete months.

    ERA5 lands a few days in arrears, so neither the month in progress nor -
    in the first days of a month - the month just ended is requested.
    """
    if raw:
        months: list[date] = []
        for item in raw:
            try:
                year, month = item.split("-")
                months.append(date(int(year), int(month), 1))
            except (ValueError, AttributeError) as error:
                raise HTTPException(
                    status_code=422, detail="CLIMATE_MONTH_INVALID"
                ) from error
        return sorted(set(months))

    newest = newest_complete_month(date.today())
    months = []
    cursor = newest
    for _ in range(12):
        months.append(cursor)
        cursor = (cursor - timedelta(days=1)).replace(day=1)
    return sorted(months)


def _http_error(error: ClimateServiceError) -> HTTPException:
    return HTTPException(status_code=error.status_code, detail=error.code)
