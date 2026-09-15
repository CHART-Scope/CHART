from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from chart.auth.schemas import CurrentUserContext
from chart.auth.service import require_current_user

from .schemas import CreateWorkspaceInput, WorkspaceResponse
from .service import WorkspaceError, create_workspace, get_workspace

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


@router.post("", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED)
def create_route(
    input_data: CreateWorkspaceInput,
    user: Annotated[CurrentUserContext, Depends(require_current_user)],
) -> WorkspaceResponse:
    try:
        return create_workspace(input_data, user)
    except WorkspaceError as error:
        raise HTTPException(status_code=error.status_code, detail=error.code) from error


@router.get("/{workspace_id}", response_model=WorkspaceResponse)
def get_route(
    workspace_id: str,
    user: Annotated[CurrentUserContext, Depends(require_current_user)],
) -> WorkspaceResponse:
    try:
        return get_workspace(workspace_id, user)
    except WorkspaceError as error:
        raise HTTPException(status_code=error.status_code, detail=error.code) from error
