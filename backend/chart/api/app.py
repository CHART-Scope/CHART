from __future__ import annotations

import json
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html
from fastapi.responses import HTMLResponse, JSONResponse
from sqlalchemy import text

from chart.api.openapi import build_openapi_schema
from chart.auth.routes import router as auth_router
from chart.climate.routes import router as climate_router
from chart.climate.schemas import ErrorResponse, HealthResponse
from chart.erf_registry.routes import router as erf_registry_router
from chart.geographies.routes import router as geographies_router
from chart.risk.routes import router as risk_router
from chart.setup.routes import router as setup_router
from chart.solution_repository.hazards import router as hazards_router
from chart.solution_repository.routes import router as solutions_router
from chart.shared.db.session import dispose_engines, get_session_factory
from chart.users.routes import router as users_router
from chart.workspaces.routes import router as workspaces_router

API_DESCRIPTION = """
The single CHART application API for authentication, geography-scoped planning,
climate data preparation, model predictions, setup, users, workspaces, hazards,
and public solutions.

Protected routes use a Keycloak bearer token and enforce both role and geography
scope. Prediction submission is durable: HTTP 200 means a completed request was
available, while HTTP 202 means Dagster has queued background work. Swagger is
available at `/docs` and ReDoc at `/redoc`.
"""


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield
    dispose_engines()


class ChartFastAPI(FastAPI):
    def openapi(self) -> dict[str, Any]:
        if self.openapi_schema is None:
            self.openapi_schema = build_openapi_schema(self)
        return self.openapi_schema


app = ChartFastAPI(
    title="CHART API",
    version="0.2.0",
    description=API_DESCRIPTION,
    docs_url=None,
    redoc_url=None,
    lifespan=lifespan,
)
app.include_router(auth_router)
app.include_router(geographies_router)
app.include_router(climate_router)
app.include_router(setup_router)
app.include_router(hazards_router)
app.include_router(solutions_router)
app.include_router(users_router)
app.include_router(workspaces_router)
app.include_router(risk_router)
app.include_router(erf_registry_router)


@app.get("/live", tags=["system"], response_model=HealthResponse)
def live() -> HealthResponse:
    return HealthResponse(status="ok")


@app.get("/ready", tags=["system"], response_model=HealthResponse)
def ready() -> HealthResponse:
    """Verify required durable state before accepting production traffic."""

    try:
        with get_session_factory()() as session:
            session.execute(text("SELECT 1"))
            revision = session.scalar(text("SELECT version_num FROM alembic_version"))
            if revision != "015_reconcile_legacy_application_schema":
                raise RuntimeError(f"database revision is {revision!r}")
            if (
                os.getenv("CHART_REQUIRE_ACTIVE_MODEL", "0") == "1"
                or os.getenv("INFERENCE_LBW_BASE_URL", "").strip()
            ):
                assignments = session.scalar(
                    text("SELECT count(*) FROM active_model_assignment")
                )
                if not assignments:
                    raise RuntimeError("no active model assignment")
    except Exception as error:
        raise HTTPException(status_code=503, detail="SERVICE_NOT_READY") from error
    return HealthResponse(status="ok")


@app.get("/health", tags=["system"], response_model=HealthResponse)
def health() -> HealthResponse:
    """Compatibility alias for readiness; use /live for process liveness."""

    return ready()


@app.get("/docs", include_in_schema=False)
def swagger_ui() -> HTMLResponse:
    return get_swagger_ui_html(openapi_url="/openapi.json", title="CHART API")


@app.get("/redoc", include_in_schema=False)
def redoc_ui() -> HTMLResponse:
    return get_redoc_html(openapi_url="/openapi.json", title="CHART API")


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
