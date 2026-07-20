from __future__ import annotations

import json
import os
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html
from fastapi.responses import HTMLResponse, JSONResponse

from chart.auth.routes import router as auth_router
from chart.auth.schemas import CurrentUserContext
from chart.auth.service import (
    require_any_role,
    require_current_user,
    require_geography_access,
)
from chart.climate.catalog import LOCATIONS, ClimateLocationSlug
from chart.climate.schemas import (
    ErrorResponse,
    HealthResponse,
    LocationListResponse,
    PredictRequest,
    PredictResponse,
    PredictionAcceptedResponse,
    PredictionRequestStatusResponse,
    PreviewRequest,
    PreviewResponse,
    TimeframeListResponse,
)
from chart.climate.requests import get_prediction_request, submit_prediction
from chart.climate.service import (
    ClimateServiceError,
    list_locations,
    list_timeframes,
    preview,
)

API_DESCRIPTION = """
Python climate API for CHART.

Reads observed ERA5 monthly facts from Postgres (`district_climate`), previews whether
data is ready for a standard timeframe, and optionally bridges to the LBW inference
service for Madhya Pradesh.

**Interactive docs**
- Swagger UI: `/docs`
- ReDoc: `/redoc`
- OpenAPI JSON: `/openapi.json`

**Related services**
- LBW inference (R/Plumber): `LBW_SERVICE_URL`, default `http://127.0.0.1:8000`
- Keycloak: bearer-token identity provider for auth and prediction routes
- CHART Fastify API (routes awaiting migration): port `3200`, docs at `/api`
"""

OPENAPI_TAGS = [
    {
        "name": "system",
        "description": "Health and service metadata.",
    },
    {
        "name": "auth",
        "description": "Keycloak user and geography access context.",
    },
    {
        "name": "climate",
        "description": "Location catalog, timeframe catalog, preview, and predict.",
    },
]

PREDICTION_ROLES = frozenset(
    {
        "chart_admin",
        "health_planning_lead",
        "cross_sector_planning_lead",
        "health_implementation_officer",
        "cross_sector_implementation_officer",
    }
)

app = FastAPI(
    title="CHART Climate API",
    version="0.1.0",
    description=API_DESCRIPTION,
    openapi_tags=OPENAPI_TAGS,
    docs_url=None,
    redoc_url=None,
)
app.include_router(auth_router)


@app.get("/health", tags=["system"], response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok")


@app.get("/docs", include_in_schema=False)
def swagger_ui() -> HTMLResponse:
    return get_swagger_ui_html(
        openapi_url="/openapi.json",
        title="CHART Climate API — Swagger",
    )


@app.get("/redoc", include_in_schema=False)
def redoc_ui() -> HTMLResponse:
    return get_redoc_html(
        openapi_url="/openapi.json",
        title="CHART Climate API — ReDoc",
    )


@app.get(
    "/climate/locations",
    tags=["climate"],
    response_model=LocationListResponse,
    summary="List supported geographies",
    description="Returns MVP geography presets that can be used as `location_slug`.",
)
def get_locations() -> LocationListResponse:
    return LocationListResponse(**list_locations())


@app.get(
    "/climate/timeframes",
    tags=["climate"],
    response_model=TimeframeListResponse,
    summary="List standard timeframes",
    description="Returns the canonical timeframe ids used by preview and predict.",
)
def get_timeframes() -> TimeframeListResponse:
    return TimeframeListResponse(**list_timeframes())


@app.post(
    "/climate/preview",
    tags=["climate"],
    response_model=PreviewResponse,
    summary="Preview climate data availability",
    responses={
        400: {"model": ErrorResponse, "description": "Invalid location or timeframe."},
    },
)
def post_preview(request: PreviewRequest) -> PreviewResponse:
    try:
        return preview(request)
    except ClimateServiceError as error:
        raise _http_error(error) from error


@app.post(
    "/climate/predict",
    tags=["climate"],
    response_model=PredictResponse | PredictionAcceptedResponse,
    summary="Preview climate data or enqueue an LBW prediction",
    responses={
        400: {
            "model": ErrorResponse,
            "description": "Invalid request or unsupported outcome.",
        },
        401: {"model": ErrorResponse, "description": "Keycloak token required."},
        403: {"model": ErrorResponse, "description": "Role or geography denied."},
        202: {
            "model": PredictionAcceptedResponse,
            "description": "Prediction queued in Dagster.",
        },
    },
)
def post_predict(
    request: PredictRequest,
    user: CurrentUserContext = Depends(require_current_user),
) -> PredictResponse | JSONResponse:
    try:
        _require_prediction_access(user, request.location_slug)
        result = submit_prediction(request)
        if isinstance(result, PredictionAcceptedResponse):
            return JSONResponse(
                status_code=202,
                content=result.model_dump(mode="json"),
                headers={"Retry-After": "3"},
            )
        return result
    except ClimateServiceError as error:
        raise _http_error(error) from error


@app.get(
    "/climate/prediction-requests/{request_id}",
    tags=["climate"],
    response_model=PredictionRequestStatusResponse,
    summary="Read a queued or completed prediction request",
    responses={
        401: {"model": ErrorResponse, "description": "Keycloak token required."},
        403: {"model": ErrorResponse, "description": "Role or geography denied."},
        404: {"model": ErrorResponse, "description": "Prediction request not found."},
    },
)
def get_prediction_request_status(
    request_id: int,
    user: CurrentUserContext = Depends(require_current_user),
) -> PredictionRequestStatusResponse:
    try:
        status = get_prediction_request(request_id)
        _require_prediction_access(user, status.location_slug)
        return status
    except ClimateServiceError as error:
        raise _http_error(error) from error


def _require_prediction_access(
    user: CurrentUserContext, location_slug: ClimateLocationSlug
) -> None:
    require_any_role(user, PREDICTION_ROLES)
    require_geography_access(user, LOCATIONS[location_slug].geography_path)


def _http_error(error: ClimateServiceError) -> HTTPException:
    return HTTPException(status_code=error.status_code, detail=error.code)


@app.exception_handler(HTTPException)
def http_exception_handler(_request, exc: HTTPException):
    detail = exc.detail if isinstance(exc.detail, str) else "REQUEST_FAILED"
    return JSONResponse(
        status_code=exc.status_code,
        content=ErrorResponse(error=detail).model_dump(),
        headers=exc.headers,
    )


def export_openapi(output_path: Path) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(app.openapi(), indent=2) + "\n", encoding="utf-8")
    return output_path


def main() -> None:
    import uvicorn

    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "3210"))
    uvicorn.run("chart.api.app:app", host=host, port=port, reload=False)
