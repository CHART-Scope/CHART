from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from chart.auth.schemas import CurrentUserContext
from chart.auth.service import require_current_user

from .schemas import CreateUserInput, UserResponse
from .service import UserServiceError, create_user, disable_user, list_users

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserResponse])
def list_route(
    user: Annotated[CurrentUserContext, Depends(require_current_user)],
) -> list[UserResponse]:
    try:
        return list_users(user)
    except UserServiceError as error:
        raise HTTPException(error.status_code, detail=error.code) from error


@router.post("", response_model=UserResponse)
def create_route(
    request: CreateUserInput,
    user: Annotated[CurrentUserContext, Depends(require_current_user)],
) -> UserResponse:
    try:
        return create_user(request, user)
    except UserServiceError as error:
        raise HTTPException(error.status_code, detail=error.code) from error


@router.post("/{user_id}/disable", response_model=UserResponse)
def disable_route(
    user_id: str,
    user: Annotated[CurrentUserContext, Depends(require_current_user)],
) -> UserResponse:
    try:
        return disable_user(user_id, user)
    except UserServiceError as error:
        raise HTTPException(error.status_code, detail=error.code) from error
