"""HTTP endpoints for workspaces, their roles, members, invitations and
departments (Settings > People, Departments, Roles, Workspaces)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path

from chart.access.guards import require_platform_admin
from chart.auth.schemas import CurrentUserContext
from chart.auth.service import require_current_user
from chart.shared.db.session import get_session_factory

from . import departments, people, service
from .schemas import (
    DepartmentCreate,
    DepartmentList,
    DepartmentUpdate,
    InvitationCreate,
    InvitationItem,
    InvitationList,
    MemberItem,
    MemberList,
    MemberUpdate,
    MyDepartments,
    Ownership,
    ResourceOptions,
    RoleList,
    WorkspaceCreate,
    WorkspaceItem,
    WorkspaceList,
)

router = APIRouter(prefix="/workspaces", tags=["workspaces"])

CurrentUser = Annotated[CurrentUserContext, Depends(require_current_user)]
WorkspaceId = Annotated[str, Path(max_length=128)]
UserId = Annotated[str, Path(max_length=128)]
InvitationId = Annotated[str, Path(min_length=36, max_length=36)]


def _call(fn, user: CurrentUserContext, *args):
    with get_session_factory()() as session:
        try:
            return fn(session, user, *args)
        except service.WorkspaceError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.code) from exc


@router.get("", response_model=WorkspaceList, summary="List my workspaces")
def list_workspaces(user: CurrentUser) -> WorkspaceList:
    return _call(service.list_workspaces, user)


@router.post(
    "", response_model=WorkspaceItem, status_code=201, summary="Create a workspace"
)
def create_workspace(body: WorkspaceCreate, user: CurrentUser) -> WorkspaceItem:
    require_platform_admin(user)
    return _call(service.create_workspace, user, body.country_code)


@router.get("/{workspace_id}/roles", response_model=RoleList, summary="List roles")
def list_roles(workspace_id: WorkspaceId, user: CurrentUser) -> RoleList:
    return _call(service.list_roles, user, workspace_id)


@router.get(
    "/{workspace_id}/resources",
    response_model=ResourceOptions,
    summary="List ownable resources",
)
def list_resources(workspace_id: WorkspaceId, user: CurrentUser) -> ResourceOptions:
    return _call(service.resource_options, user, workspace_id)


@router.get(
    "/{workspace_id}/members", response_model=MemberList, summary="List members"
)
def list_members(workspace_id: WorkspaceId, user: CurrentUser) -> MemberList:
    return _call(people.list_members, user, workspace_id)


@router.put(
    "/{workspace_id}/members/{user_id}",
    response_model=MemberItem,
    summary="Change a member",
)
def update_member(
    workspace_id: WorkspaceId, user_id: UserId, body: MemberUpdate, user: CurrentUser
) -> MemberItem:
    return _call(people.update_member, user, workspace_id, user_id, body)


@router.post(
    "/{workspace_id}/members/{user_id}/disable",
    response_model=MemberItem,
    summary="Disable a member",
)
def disable_member(
    workspace_id: WorkspaceId, user_id: UserId, user: CurrentUser
) -> MemberItem:
    return _call(people.set_member_status, user, workspace_id, user_id, False)


@router.post(
    "/{workspace_id}/members/{user_id}/enable",
    response_model=MemberItem,
    summary="Enable a member",
)
def enable_member(
    workspace_id: WorkspaceId, user_id: UserId, user: CurrentUser
) -> MemberItem:
    return _call(people.set_member_status, user, workspace_id, user_id, True)


@router.get(
    "/{workspace_id}/invitations",
    response_model=InvitationList,
    summary="List invitations",
)
def list_invitations(workspace_id: WorkspaceId, user: CurrentUser) -> InvitationList:
    return _call(people.list_invitations, user, workspace_id)


@router.post(
    "/{workspace_id}/invitations",
    response_model=InvitationItem,
    status_code=201,
    summary="Invite someone",
)
def invite(
    workspace_id: WorkspaceId, body: InvitationCreate, user: CurrentUser
) -> InvitationItem:
    return _call(people.invite, user, workspace_id, body)


@router.post(
    "/{workspace_id}/invitations/{invitation_id}/resend",
    response_model=InvitationItem,
    summary="Resend an invitation",
)
def resend_invitation(
    workspace_id: WorkspaceId, invitation_id: InvitationId, user: CurrentUser
) -> InvitationItem:
    return _call(people.resend_invitation, user, workspace_id, invitation_id)


@router.post(
    "/{workspace_id}/invitations/{invitation_id}/revoke",
    response_model=InvitationItem,
    summary="Revoke an invitation",
)
def revoke_invitation(
    workspace_id: WorkspaceId, invitation_id: InvitationId, user: CurrentUser
) -> InvitationItem:
    return _call(people.revoke_invitation, user, workspace_id, invitation_id)


@router.get(
    "/{workspace_id}/departments",
    response_model=DepartmentList,
    summary="List departments",
)
def list_departments(workspace_id: WorkspaceId, user: CurrentUser) -> DepartmentList:
    return _call(departments.list_departments, user, workspace_id)


@router.post(
    "/{workspace_id}/departments",
    response_model=DepartmentList,
    status_code=201,
    summary="Add a department",
)
def add_department(
    workspace_id: WorkspaceId, body: DepartmentCreate, user: CurrentUser
) -> DepartmentList:
    return _call(departments.add_department, user, workspace_id, body.name)


@router.put(
    "/{workspace_id}/departments/mine",
    response_model=DepartmentList,
    summary="Set my departments",
)
def set_my_departments(
    workspace_id: WorkspaceId, body: MyDepartments, user: CurrentUser
) -> DepartmentList:
    return _call(
        departments.set_my_departments, user, workspace_id, body.department_ids
    )


@router.patch(
    "/{workspace_id}/departments/{department_id}",
    response_model=DepartmentList,
    summary="Rename or archive a department",
)
def update_department(
    workspace_id: WorkspaceId,
    department_id: int,
    body: DepartmentUpdate,
    user: CurrentUser,
) -> DepartmentList:
    return _call(departments.update_department, user, workspace_id, department_id, body)


@router.delete(
    "/{workspace_id}/departments/{department_id}",
    response_model=DepartmentList,
    summary="Delete an unused department",
)
def delete_department(
    workspace_id: WorkspaceId, department_id: int, user: CurrentUser
) -> DepartmentList:
    return _call(departments.delete_department, user, workspace_id, department_id)


@router.put(
    "/{workspace_id}/departments/{department_id}/ownership",
    response_model=DepartmentList,
    summary="Set what a department owns",
)
def set_ownership(
    workspace_id: WorkspaceId,
    department_id: int,
    body: Ownership,
    user: CurrentUser,
) -> DepartmentList:
    return _call(departments.set_ownership, user, workspace_id, department_id, body)
