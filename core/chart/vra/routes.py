"""HTTP endpoints for the vulnerability and resilience assessment.

Reads need vra read at the frame; uploads, runs, coverage and the template
need vra write there. Rows for an indicator group (category) owned by other
departments are refused unless the uploader manages VRA.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import select
from starlette.concurrency import run_in_threadpool
from starlette.responses import JSONResponse

from chart.auth.schemas import CurrentUserContext
from chart.access.guards import can, require_capability
from chart.auth.service import require_current_user, require_reader
from chart.risk.routes import _resolve_place_path
from chart.shared.db.models import AppGeography, DepartmentOwnership
from chart.risk.schemas import MapResponse
from chart.risk.service import NoAdminUnitForGeography, resolve_map_frame
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
#: Published assessments are public reads on an open installation.
Reader = Annotated[CurrentUserContext, Depends(require_reader)]


def _require_admin(user: CurrentUserContext, geography_id: str) -> None:
    _require(user, geography_id, "write")


def _require_reader(user: CurrentUserContext, geography_id: str) -> None:
    _require(user, geography_id, "read")


def _require(user: CurrentUserContext, geography_id: str, level: str) -> None:
    """At the place and its map frame: a leaf comparison includes siblings."""
    require_capability(user, "vra", level, _resolve_place_path(geography_id))
    with get_session_factory()() as session:
        try:
            frame = resolve_map_frame(session, geography_id)
        except NoAdminUnitForGeography as exc:
            raise HTTPException(status_code=404, detail="GEOGRAPHY_NOT_FOUND") from exc
        require_capability(user, "vra", level, frame.path)


def _readable_areas(user: CurrentUserContext, result):
    """Keep the frame's areas the person reads: reading a place above one's
    grants shows its figures, not the detail of sibling areas."""
    if not hasattr(result, "areas"):
        return result
    with get_session_factory()() as session:
        paths: dict[str, str] = {
            id_: path
            for id_, path in session.execute(select(AppGeography.id, AppGeography.path))
        }
    result.areas = [
        area
        for area in result.areas
        if area.geography_id in paths
        and can(user, "vra", "read", paths[area.geography_id])
    ]
    return result


def _indicator_writer(user: CurrentUserContext, geography_id: str):
    """Whether the uploader may write an indicator's group at the place."""
    place = _resolve_place_path(geography_id)
    with get_session_factory()() as session:
        owners: dict[str, set[int]] = {}
        for key, department in session.execute(
            select(
                DepartmentOwnership.resource_key, DepartmentOwnership.department_id
            ).where(DepartmentOwnership.resource_kind == "vra_indicator_group")
        ):
            owners.setdefault(key, set()).add(department)
    return lambda indicator: can(
        user, "vra", "write", place, owners.get(indicator.category, set())
    )


def _call(fn, *args):
    """Run a service call in a session, mapping its errors to HTTP."""

    with get_session_factory()() as session:
        try:
            return fn(session, *args)
        except NoAdminUnitForGeography as exc:
            raise HTTPException(status_code=404, detail="GEOGRAPHY_NOT_FOUND") from exc
        except service.VraError as exc:
            if exc.message is not None:
                return JSONResponse(
                    status_code=exc.status_code,
                    content={"error": exc.code, "message": exc.message},
                )
            raise HTTPException(status_code=exc.status_code, detail=exc.code) from exc


@router.get(
    "/indicators", response_model=IndicatorList, summary="List the VRA catalogue"
)
def read_indicators(user: Reader) -> IndicatorList:
    return IndicatorList(items=_call(service.list_indicators))


@router.get(
    "/{geography_id}/assessment",
    response_model=AssessmentResponse,
    summary="Read the latest assessment of a frame's child areas",
)
def read_assessment(geography_id: str, user: Reader) -> AssessmentResponse:
    _require_reader(user, geography_id)
    return _readable_areas(user, _call(service.load_assessment, geography_id))


@router.get(
    "/{geography_id}/map",
    response_model=MapResponse,
    summary="Read the frame's areas shaded by VRA risk",
)
def read_map(geography_id: str, user: Reader) -> MapResponse:
    _require_reader(user, geography_id)
    return _readable_areas(user, _call(service.load_map, geography_id))


@router.get(
    "/{geography_id}/areas/{area_geography_id}",
    response_model=AreaDetailResponse,
    summary="Read one area's scores and indicator values",
)
def read_area(
    geography_id: str, area_geography_id: str, user: Reader
) -> AreaDetailResponse:
    _require_reader(user, geography_id)
    result = _call(service.load_area, geography_id, area_geography_id)
    # The area must be in the frame (the service says so) and readable.
    if not isinstance(result, JSONResponse):
        require_capability(user, "vra", "read", _resolve_place_path(area_geography_id))
    return result


@router.get(
    "/{geography_id}/coverage",
    response_model=CoverageResponse,
    summary="Read indicator coverage and upload history (admin)",
)
def read_coverage(
    geography_id: str,
    user: CurrentUser,
    level: Annotated[
        str | None, Query(max_length=64, pattern=r"^[A-Za-z0-9_]+$")
    ] = None,
) -> CoverageResponse:
    _require_admin(user, geography_id)
    return _call(service.load_coverage, geography_id, level)


@router.get(
    "/{geography_id}/template.csv",
    summary="Download a blank upload template for the frame's areas (admin)",
    response_class=Response,
)
def read_template(
    geography_id: str,
    user: CurrentUser,
    indicator_code: Annotated[str | None, Query(max_length=128)] = None,
    level: Annotated[
        str | None, Query(max_length=64, pattern=r"^[A-Za-z0-9_]+$")
    ] = None,
) -> Response:
    _require_admin(user, geography_id)
    body = _call(service.template_csv, geography_id, indicator_code, level)
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
    indicator_code: Annotated[str | None, Query(max_length=128)] = None,
    level: Annotated[
        str | None, Query(max_length=64, pattern=r"^[A-Za-z0-9_]+$")
    ] = None,
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
        _call,
        service.ingest_csv,
        geography_id,
        text,
        file_name,
        user.user_id,
        indicator_code,
        level,
        await run_in_threadpool(_indicator_writer, user, geography_id),
    )


@router.post(
    "/{geography_id}/runs",
    response_model=AssessmentResponse,
    summary="Refresh computed hazard and score the frame's areas (admin)",
)
def create_run(
    geography_id: str,
    user: CurrentUser,
    level: Annotated[
        str | None, Query(max_length=64, pattern=r"^[A-Za-z0-9_]+$")
    ] = None,
) -> AssessmentResponse:
    """With ``level`` (e.g. ``district``) every area of that level beneath the
    frame is scored together, not only the frame's children."""
    _require_admin(user, geography_id)
    return _call(service.run_assessment, geography_id, user.user_id, level)
