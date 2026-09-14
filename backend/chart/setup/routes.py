from __future__ import annotations

import os
import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException

from chart.auth.schemas import CurrentUserContext
from chart.auth.service import require_current_user

from .schemas import (
    BootstrapSetupInput,
    BootstrapSetupResponse,
    CompleteSetupInput,
    ModelSyncResponse,
    SetupOptions,
    SetupStatus,
)
from .service import (
    SetupError,
    bootstrap,
    complete,
    get_options,
    get_status,
    reset,
    sync_deployed_models,
)

router = APIRouter(prefix="/setup", tags=["setup"])


@router.get("", response_model=SetupStatus)
def status() -> SetupStatus:
    return get_status()


@router.get("/options", response_model=SetupOptions)
def options() -> SetupOptions:
    return get_options()


@router.post("/bootstrap", response_model=BootstrapSetupResponse)
def bootstrap_route(
    request: BootstrapSetupInput,
    bootstrap_token: Annotated[
        str | None, Header(alias="X-CHART-Bootstrap-Token")
    ] = None,
) -> BootstrapSetupResponse:
    configured = os.getenv("CHART_BOOTSTRAP_TOKEN", "")
    if not configured:
        raise HTTPException(503, detail="SETUP_BOOTSTRAP_DISABLED")
    if bootstrap_token is None or not secrets.compare_digest(
        bootstrap_token, configured
    ):
        raise HTTPException(403, detail="SETUP_BOOTSTRAP_FORBIDDEN")
    try:
        return bootstrap(request)
    except SetupError as error:
        raise HTTPException(error.status_code, detail=error.code) from error


@router.post("/complete", response_model=SetupStatus)
def complete_route(
    request: CompleteSetupInput,
    user: Annotated[CurrentUserContext, Depends(require_current_user)],
) -> SetupStatus:
    try:
        return complete(request, user)
    except SetupError as error:
        raise HTTPException(error.status_code, detail=error.code) from error


@router.post("/reset", response_model=SetupStatus)
def reset_route(
    user: Annotated[CurrentUserContext, Depends(require_current_user)],
) -> SetupStatus:
    try:
        return reset(user)
    except SetupError as error:
        raise HTTPException(error.status_code, detail=error.code) from error


@router.post("/models/sync", response_model=ModelSyncResponse)
def sync_models_route(
    user: Annotated[CurrentUserContext, Depends(require_current_user)],
) -> ModelSyncResponse:
    try:
        return sync_deployed_models(user)
    except SetupError as error:
        raise HTTPException(error.status_code, detail=error.code) from error
