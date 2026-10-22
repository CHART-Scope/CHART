"""HTTP endpoints for the vulnerability and resilience assessment.

Reads follow the dashboard map's rule (reader role and geography scope);
uploads, runs, coverage and the template are for ``chart_admin`` within scope.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from starlette.concurrency import run_in_threadpool

from chart.auth.schemas import CurrentUserContext
from chart.auth.service import (
    require_any_role,
    require_current_user,
    require_geography_access,
)
from chart.risk.routes import (
    _require_read_access,
    _resolve_place_path,
    risk_reader_roles,
)
from chart.risk.schemas import MapResponse
from chart.risk.service import NoAdminUnitForGeography
from chart.shared.db.session import get_session_factory

from . import service
from .schemas import (
    AreaDetailResponse,
    AssessmentResponse,
    CoverageResponse,
    IndicatorList,
    IngestionResult,
)

router = APIRouter(prefix="/vra", tags=["vra"])

MAX_UPLOAD_BYTES = 2_000_000
CurrentUser = Annotated[CurrentUserContext, Depends(require_current_user)]


def _require_admin(user: CurrentUserContext, geography_id: str) -> None:
    require_any_role(user, {"chart_admin"})
    require_geography_access(user, _resolve_place_path(geography_id))


def _call(fn, *args):
    """Run a service call in a session, mapping its errors to HTTP."""

    with get_session_factory()() as session:
        try:
            return fn(session, *args)
        except NoAdminUnitForGeography as exc:
            raise HTTPException(status_code=404, detail="GEOGRAPHY_NOT_FOUND") from exc
        except service.VraError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.code) from exc


@router.get(
    "/indicators", response_model=IndicatorList, summary="List the VRA catalogue"
)
def read_indicators(user: CurrentUser) -> IndicatorList:
    require_any_role(user, risk_reader_roles)
    return IndicatorList(items=_call(service.list_indicators))


@router.get(
    "/{geography_id}/assessment",
    response_model=AssessmentResponse,
    summary="Read the latest assessment of a frame's child areas",
)
def read_assessment(geography_id: str, user: CurrentUser) -> AssessmentResponse:
    _require_read_access(user, geography_id)
    return _call(service.load_assessment, geography_id)


@router.get(
    "/{geography_id}/map",
    response_model=MapResponse,
    summary="Read the frame's areas shaded by VRA risk",
)
def read_map(geography_id: str, user: CurrentUser) -> MapResponse:
    _require_read_access(user, geography_id)
    return _call(service.load_map, geography_id)


@router.get(
    "/{geography_id}/areas/{area_geography_id}",
    response_model=AreaDetailResponse,
    summary="Read one area's scores and indicator values",
)
def read_area(
    geography_id: str, area_geography_id: str, user: CurrentUser
) -> AreaDetailResponse:
    _require_read_access(user, geography_id)
    return _call(service.load_area, geography_id, area_geography_id)


@router.get(
    "/{geography_id}/coverage",
    response_model=CoverageResponse,
    summary="Read indicator coverage and upload history (admin)",
)
def read_coverage(geography_id: str, user: CurrentUser) -> CoverageResponse:
    _require_admin(user, geography_id)
    return _call(service.load_coverage, geography_id)


@router.get(
    "/{geography_id}/template.csv",
    summary="Download a blank upload template for the frame's areas (admin)",
    response_class=Response,
)
def read_template(geography_id: str, user: CurrentUser) -> Response:
    _require_admin(user, geography_id)
    body = _call(service.template_csv, geography_id)
    return Response(
        content=body,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="vra-template-{geography_id}.csv"'
        },
    )


@router.post(
    "/{geography_id}/values",
    response_model=IngestionResult,
    summary="Upload indicator values as CSV (admin)",
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {"text/csv": {"schema": {"type": "string"}}},
        }
    },
)
async def upload_values(
    geography_id: str,
    request: Request,
    user: CurrentUser,
    file_name: Annotated[str | None, Query(max_length=256)] = None,
) -> IngestionResult:
    await run_in_threadpool(_require_admin, user, geography_id)
    raw = await request.body()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="VRA_UPLOAD_TOO_LARGE")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=422, detail="VRA_CSV_NOT_UTF8") from exc
    return await run_in_threadpool(
        _call, service.ingest_csv, geography_id, text, file_name, user.user_id
    )


@router.post(
    "/{geography_id}/runs",
    response_model=AssessmentResponse,
    summary="Refresh computed hazard and score the frame's areas (admin)",
)
def create_run(geography_id: str, user: CurrentUser) -> AssessmentResponse:
    _require_admin(user, geography_id)
    return _call(service.run_assessment, geography_id, user.user_id)
