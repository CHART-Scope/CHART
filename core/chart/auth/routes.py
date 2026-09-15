from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query

from .schemas import AuthErrorResponse, CurrentUserContext, GeographyAccessResponse
from .service import (
    apply_active_geography,
    can_read_geography_path,
    require_current_user,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get(
    "/me",
    response_model=CurrentUserContext,
    summary="Resolve the current user role and geography context",
    responses={
        401: {"model": AuthErrorResponse, "description": "Keycloak token required."},
        403: {"model": AuthErrorResponse, "description": "Geography is out of scope."},
        500: {"model": AuthErrorResponse, "description": "Auth configuration error."},
    },
)
def get_current_user(
    user: Annotated[CurrentUserContext, Depends(require_current_user)],
    active_geography: Annotated[str | None, Query(alias="activeGeography")] = None,
    active_geography_header: Annotated[
        str | None, Header(alias="X-Chart-Active-Geography")
    ] = None,
) -> CurrentUserContext:
    return apply_active_geography(user, active_geography or active_geography_header)


@router.get(
    "/geography-access",
    response_model=GeographyAccessResponse,
    summary="Check whether the current user can read a geography path",
    responses={
        400: {"model": AuthErrorResponse, "description": "Geography is required."},
        401: {"model": AuthErrorResponse, "description": "Keycloak token required."},
        403: {"model": AuthErrorResponse, "description": "Geography is out of scope."},
        500: {"model": AuthErrorResponse, "description": "Auth configuration error."},
    },
)
def get_geography_access(
    user: Annotated[CurrentUserContext, Depends(require_current_user)],
    geography: str | None = None,
) -> GeographyAccessResponse:
    if geography is None:
        raise HTTPException(status_code=400, detail="GEOGRAPHY_QUERY_REQUIRED")
    if not can_read_geography_path(user, geography):
        raise HTTPException(status_code=403, detail="GEOGRAPHY_OUT_OF_SCOPE")
    normalized = "/" + "/".join(part for part in geography.split("/") if part)
    return GeographyAccessResponse.model_validate(
        {
            "can_access": True,
            "geography_path": normalized,
            "user_id": user.user_id,
        }
    )
