from __future__ import annotations

import uuid

from sqlalchemy import select

from chart.auth.schemas import CurrentUserContext
from chart.auth.service import can_read_geography_path
from chart.shared.db.models import (
    AppGeography,
    AppUser,
    WorkspaceMemberRecord,
    WorkspaceRecord,
)
from chart.shared.db.session import get_session_factory

from .schemas import CreateWorkspaceInput, WorkspaceResponse

CREATE_ROLES = {
    "health_planning_lead",
    "cross_sector_planning_lead",
    "chart_admin",
}


class WorkspaceError(ValueError):
    def __init__(self, code: str, status_code: int) -> None:
        super().__init__(code)
        self.code = code
        self.status_code = status_code


def create_workspace(
    input_data: CreateWorkspaceInput,
    user: CurrentUserContext,
    *,
    session_factory=None,
) -> WorkspaceResponse:
    if not CREATE_ROLES.intersection(user.roles):
        raise WorkspaceError("WORKSPACE_CREATE_FORBIDDEN", 403)
    session_factory = session_factory or get_session_factory()
    with session_factory() as session:
        geography = session.get(AppGeography, input_data.geography_id)
        if geography is None or not _can_use(user, geography.path):
            raise WorkspaceError("WORKSPACE_ACCESS_DENIED", 403)
        app_user = session.get(AppUser, user.user_id)
        if app_user is None:
            app_user = AppUser(
                id=user.user_id,
                username=user.username,
                email=user.email,
                display_name=user.username,
                status="active",
            )
            session.add(app_user)
            session.flush()
        workspace = WorkspaceRecord(
            id=f"workspace-{uuid.uuid4()}",
            name=input_data.name.strip(),
            planning_cycle=(input_data.planning_cycle or "").strip() or None,
            status="active",
            geography_id=geography.id,
            created_by_user_id=user.user_id,
            owner_user_id=user.user_id,
        )
        session.add(workspace)
        session.flush()
        session.add(
            WorkspaceMemberRecord(
                id=f"member-{uuid.uuid4()}",
                workspace_id=workspace.id,
                user_id=user.user_id,
                role="owner",
            )
        )
        session.commit()
        return _response(workspace, "owner")


def get_workspace(
    workspace_id: str,
    user: CurrentUserContext,
    *,
    session_factory=None,
) -> WorkspaceResponse:
    session_factory = session_factory or get_session_factory()
    with session_factory() as session:
        workspace = session.get(WorkspaceRecord, workspace_id)
        if workspace is None:
            raise WorkspaceError("WORKSPACE_NOT_FOUND", 404)
        member = session.scalar(
            select(WorkspaceMemberRecord).where(
                WorkspaceMemberRecord.workspace_id == workspace.id,
                WorkspaceMemberRecord.user_id == user.user_id,
            )
        )
        if "chart_admin" not in user.roles and member is None:
            raise WorkspaceError("WORKSPACE_ACCESS_DENIED", 403)
        return _response(workspace, member.role if member else None)


def _can_use(user: CurrentUserContext, path: str) -> bool:
    return "chart_admin" in user.roles or can_read_geography_path(user, path)


def _response(workspace: WorkspaceRecord, role: str | None) -> WorkspaceResponse:
    return WorkspaceResponse.model_validate(
        {
            "id": workspace.id,
            "name": workspace.name,
            "planning_cycle": workspace.planning_cycle,
            "status": workspace.status,
            "geography_id": workspace.geography_id,
            "created_by_user_id": workspace.created_by_user_id,
            "owner_user_id": workspace.owner_user_id,
            "member_role": role,
        }
    )
