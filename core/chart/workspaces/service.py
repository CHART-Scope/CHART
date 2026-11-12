"""Workspaces (one per country), their roles, and what the checks share.

People, invitations and departments live beside this in ``people`` and
``departments``. Capabilities follow docs/access-control.md: a grant covers
its place and everything below it; workspace-wide lists (roles, departments)
use the highest level the person holds anywhere in the workspace.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import distinct, func, select
from sqlalchemy.orm import Session

from chart.access.capabilities import MODULES, RANK, higher
from chart.access.guards import principal_of
from chart.access.principal import normalize
from chart.access.workspaces import ensure_workspace
from chart.auth.schemas import CurrentUserContext
from chart.shared.db.models import (
    AccessRole,
    AccessRoleCapability,
    AppGeography,
    AuditEventRecord,
    DataSource,
    Membership,
    VraIndicator,
    WorkspaceRecord,
)

from .schemas import (
    ResourceOption,
    ResourceOptions,
    RoleItem,
    RoleList,
    WorkspaceItem,
    WorkspaceList,
)

#: The climate source pulls write (``chart.climate.routes.CLIMATE_SOURCE``).
CLIMATE_SOURCE_OPTION = ResourceOption(
    kind="data_source", key="era5", name="ERA5 climate (Copernicus)"
)


class WorkspaceError(ValueError):
    def __init__(self, code: str, status_code: int) -> None:
        super().__init__(code)
        self.code = code
        self.status_code = status_code


def list_workspaces(session: Session, user: CurrentUserContext) -> WorkspaceList:
    principal = principal_of(user)
    query = select(WorkspaceRecord).where(WorkspaceRecord.country_code.is_not(None))
    if not principal.is_platform_admin:
        mine = [workspace.workspace_id for workspace in principal.workspaces]
        query = query.where(WorkspaceRecord.id.in_(mine))
    rows = session.scalars(query.order_by(WorkspaceRecord.name)).all()
    return WorkspaceList(items=[_item(session, row) for row in rows])


def create_workspace(
    session: Session, user: CurrentUserContext, country_code: str
) -> WorkspaceItem:
    if not principal_of(user).is_platform_admin:
        raise WorkspaceError("PLATFORM_ADMIN_REQUIRED", 403)
    code = country_code.upper()
    if (
        session.scalar(
            select(AppGeography.id).where(
                AppGeography.level == "country", AppGeography.country_code == code
            )
        )
        is None
    ):
        raise WorkspaceError("COUNTRY_NOT_FOUND", 404)
    if session.scalar(
        select(WorkspaceRecord.id).where(WorkspaceRecord.country_code == code)
    ):
        raise WorkspaceError("WORKSPACE_EXISTS", 409)
    workspace = ensure_workspace(session, code, created_by=user.user_id)
    audit(session, user, "workspace_created", {"workspace_id": workspace.id})
    session.commit()
    return _item(session, workspace)


def list_roles(
    session: Session, user: CurrentUserContext, workspace_id: str
) -> RoleList:
    workspace, _root = workspace_for(session, user, workspace_id)
    roles = session.scalars(
        select(AccessRole)
        .where(AccessRole.workspace_id == workspace.id)
        .order_by(AccessRole.id)
    ).all()
    return RoleList(
        modules=list(MODULES),
        items=[
            RoleItem(
                id=role.id,
                key=role.key,
                name=role.name,
                is_default=role.is_default,
                capabilities=role_levels(session, role.id),
            )
            for role in roles
        ],
    )


def resource_options(
    session: Session, user: CurrentUserContext, workspace_id: str
) -> ResourceOptions:
    """Data sources and VRA indicator groups a department can own."""

    workspace_for(session, user, workspace_id)
    sources = [CLIMATE_SOURCE_OPTION]
    for name, kind in session.execute(
        select(DataSource.name, DataSource.kind).order_by(DataSource.name)
    ):
        key = f"{kind}:{name}".lower()
        if all(option.key != key for option in sources):
            sources.append(ResourceOption(kind="data_source", key=key, name=name))
    groups = [
        ResourceOption(kind="vra_indicator_group", key=category, name=category)
        for category in session.scalars(
            select(distinct(VraIndicator.category)).order_by(VraIndicator.category)
        )
    ]
    return ResourceOptions(items=[*sources, *groups])


def workspace_for(
    session: Session, user: CurrentUserContext, workspace_id: str
) -> tuple[WorkspaceRecord, str]:
    """The workspace and its country's path, for a member or platform admin.

    Anyone else is told it does not exist, so ids are not probed.
    """

    principal = principal_of(user)
    workspace = session.get(WorkspaceRecord, workspace_id)
    member = any(w.workspace_id == workspace_id for w in principal.workspaces)
    if (
        workspace is None
        or not principal.active
        or not (member or principal.is_platform_admin)
    ):
        raise WorkspaceError("WORKSPACE_NOT_FOUND", 404)
    place = session.get(AppGeography, workspace.geography_id)
    if place is None:
        raise WorkspaceError("WORKSPACE_NOT_FOUND", 404)
    return workspace, normalize(place.path)


def workspace_level(
    user: CurrentUserContext, workspace_id: str, module: str
) -> str | None:
    """The highest level on a module the person holds anywhere in the workspace."""

    principal = principal_of(user)
    if principal.is_platform_admin:
        return "manage"
    best: str | None = None
    for workspace in principal.workspaces:
        if workspace.workspace_id == workspace_id:
            for grant in workspace.grants:
                best = higher(best, grant.levels.get(module))
    return best


def need_workspace_level(
    user: CurrentUserContext, workspace_id: str, module: str, level: str
) -> None:
    held = workspace_level(user, workspace_id, module)
    if held is None or RANK[held] < RANK[level]:
        raise WorkspaceError("CAPABILITY_NOT_ALLOWED", 403)


def role_levels(session: Session, role_id: int) -> dict[str, str]:
    rows = session.execute(
        select(AccessRoleCapability.module, AccessRoleCapability.level).where(
            AccessRoleCapability.role_id == role_id
        )
    )
    return {module: level for module, level in rows}


def audit(
    session: Session, user: CurrentUserContext, event_type: str, payload: dict
) -> None:
    session.add(
        AuditEventRecord(
            user_id=user.user_id,
            session_id="server",
            flush_id=f"{event_type}-{uuid.uuid4()}",
            client_seq=0,
            event_type=event_type,
            occurred_at=datetime.now(UTC),
            payload=payload,
        )
    )


def _item(session: Session, workspace: WorkspaceRecord) -> WorkspaceItem:
    place = session.get(AppGeography, workspace.geography_id)
    return WorkspaceItem(
        id=workspace.id,
        country_code=workspace.country_code or "",
        name=workspace.name,
        geography_id=workspace.geography_id,
        place_path=normalize(place.path) if place else None,
        member_count=session.scalar(
            select(func.count())
            .select_from(Membership)
            .where(
                Membership.workspace_id == workspace.id, Membership.status == "active"
            )
        )
        or 0,
    )
