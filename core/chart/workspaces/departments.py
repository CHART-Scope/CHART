"""A workspace's departments: rows its members manage, never an enum.

Every member reads the list and may leave a department; joining one takes
``people:write``, as departments narrow writes. ``departments:write``
adds one; ``departments:manage`` renames, archives and deletes. A Workspace
admin (``workspace:manage``) sets which data sources and VRA indicator
groups each department owns, which narrows writes there
(docs/access-control.md).
"""

from __future__ import annotations

import re
from typing import cast

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from chart.access.capabilities import RANK
from chart.access.principal import forget
from chart.auth.schemas import CurrentUserContext
from chart.shared.db.models import (
    Department,
    DepartmentOwnership,
    InvitationDepartment,
    Membership,
    MembershipDepartment,
    WorkspaceRecord,
)

from .schemas import (
    DepartmentItem,
    DepartmentList,
    DepartmentUpdate,
    Ownership,
    ResourceKind,
    ResourceRef,
)
from .service import (
    WorkspaceError,
    audit,
    need_workspace_level,
    workspace_for,
    workspace_level,
)


def list_departments(
    session: Session, user: CurrentUserContext, workspace_id: str
) -> DepartmentList:
    workspace, _root = workspace_for(session, user, workspace_id)
    need_workspace_level(user, workspace.id, "departments", "read")
    rows = workspace_departments(session, workspace.id, archived=True)
    ids = [row.id for row in rows]
    counts: dict[int, int] = {
        department_id: count
        for department_id, count in session.execute(
            select(MembershipDepartment.department_id, func.count())
            .join(Membership, Membership.id == MembershipDepartment.membership_id)
            .where(
                MembershipDepartment.department_id.in_(ids),
                Membership.status == "active",
            )
            .group_by(MembershipDepartment.department_id)
        )
    }
    owns: dict[int, list[ResourceRef]] = {}
    for row in session.scalars(
        select(DepartmentOwnership)
        .where(DepartmentOwnership.department_id.in_(ids))
        .order_by(DepartmentOwnership.resource_kind, DepartmentOwnership.resource_key)
    ):
        owns.setdefault(row.department_id, []).append(
            ResourceRef(
                kind=cast(ResourceKind, row.resource_kind), key=row.resource_key
            )
        )
    mine = set(
        session.scalars(
            select(MembershipDepartment.department_id)
            .join(Membership, Membership.id == MembershipDepartment.membership_id)
            .where(
                Membership.user_id == user.user_id,
                Membership.workspace_id == workspace.id,
            )
        )
    )
    return DepartmentList(
        items=[
            DepartmentItem(
                id=row.id,
                name=row.name,
                archived=row.archived_at is not None,
                member_count=counts.get(row.id, 0),
                owns=owns.get(row.id, []),
            )
            for row in rows
        ],
        mine=[row.id for row in rows if row.id in mine and row.archived_at is None],
    )


def add_department(
    session: Session, user: CurrentUserContext, workspace_id: str, name: str
) -> DepartmentList:
    workspace, _root = workspace_for(session, user, workspace_id)
    add_named_departments(session, user, workspace.id, [name])
    session.commit()
    return list_departments(session, user, workspace.id)


def add_named_departments(
    session: Session, user: CurrentUserContext, workspace_id: str, names: list[str]
) -> set[int]:
    """Add departments by name (from the list or an invitation); a name the
    workspace already has, in any letter case, is refused."""

    need_workspace_level(user, workspace_id, "departments", "write")
    country = _country(session, workspace_id)
    added: set[int] = set()
    for name in names:
        clean = _clean(name)
        if _named(session, workspace_id, clean) is not None:
            raise WorkspaceError("DEPARTMENT_EXISTS", 409)
        department = Department(
            country_code=country,
            workspace_id=workspace_id,
            name=clean,
            created_by_user_id=user.user_id,
        )
        session.add(department)
        session.flush()
        added.add(department.id)
        audit(
            session,
            user,
            "department_added",
            {"workspace_id": workspace_id, "department_id": department.id},
        )
    return added


def update_department(
    session: Session,
    user: CurrentUserContext,
    workspace_id: str,
    department_id: int,
    update: DepartmentUpdate,
) -> DepartmentList:
    workspace, _root = workspace_for(session, user, workspace_id)
    need_workspace_level(user, workspace.id, "departments", "manage")
    department = _department(session, workspace.id, department_id)
    if update.name is not None:
        clean = _clean(update.name)
        other = _named(session, workspace.id, clean)
        if other is not None and other.id != department.id:
            raise WorkspaceError("DEPARTMENT_EXISTS", 409)
        department.name = clean
    if update.archived is not None:
        department.archived_at = func.now() if update.archived else None
    audit(
        session,
        user,
        "department_changed",
        {
            "workspace_id": workspace.id,
            "department_id": department.id,
            "name": update.name,
            "archived": update.archived,
        },
    )
    session.commit()
    _forget_members(session, department.id)
    return list_departments(session, user, workspace.id)


def delete_department(
    session: Session, user: CurrentUserContext, workspace_id: str, department_id: int
) -> DepartmentList:
    """Only a department nobody uses; archive one that has history."""

    workspace, _root = workspace_for(session, user, workspace_id)
    need_workspace_level(user, workspace.id, "departments", "manage")
    department = _department(session, workspace.id, department_id)
    in_use = any(
        session.scalar(
            select(model.department_id)
            .where(model.department_id == department.id)
            .limit(1)
        )
        is not None
        for model in (MembershipDepartment, InvitationDepartment, DepartmentOwnership)
    )
    if in_use:
        raise WorkspaceError("DEPARTMENT_IN_USE", 409)
    session.delete(department)
    audit(
        session,
        user,
        "department_deleted",
        {"workspace_id": workspace.id, "department_id": department_id},
    )
    session.commit()
    return list_departments(session, user, workspace.id)


def set_my_departments(
    session: Session,
    user: CurrentUserContext,
    workspace_id: str,
    department_ids: list[int],
) -> DepartmentList:
    workspace, _root = workspace_for(session, user, workspace_id)
    membership = session.scalar(
        select(Membership).where(
            Membership.workspace_id == workspace.id,
            Membership.user_id == user.user_id,
            Membership.status == "active",
        )
    )
    if membership is None:
        raise WorkspaceError("MEMBER_NOT_FOUND", 404)
    available = {row.id for row in workspace_departments(session, workspace.id)}
    wanted = set(department_ids)
    if not wanted <= available:
        raise WorkspaceError("DEPARTMENT_UNKNOWN", 422)
    # Departments narrow writes, so joining one is a grant: it needs what
    # adding someone to it needs (people:write). Leaving is always allowed.
    held = set(
        session.scalars(
            select(MembershipDepartment.department_id).where(
                MembershipDepartment.membership_id == membership.id
            )
        )
    )
    if wanted - held and not _may_assign_departments(user, workspace.id):
        raise WorkspaceError("DEPARTMENT_JOIN_NOT_ALLOWED", 403)
    session.execute(
        delete(MembershipDepartment).where(
            MembershipDepartment.membership_id == membership.id
        )
    )
    session.add_all(
        MembershipDepartment(membership_id=membership.id, department_id=id_)
        for id_ in sorted(wanted)
    )
    session.commit()
    forget(user.user_id)
    return list_departments(session, user, workspace.id)


def _may_assign_departments(user: CurrentUserContext, workspace_id: str) -> bool:
    held = workspace_level(user, workspace_id, "people")
    return held is not None and RANK[held] >= RANK["write"]


def set_ownership(
    session: Session,
    user: CurrentUserContext,
    workspace_id: str,
    department_id: int,
    ownership: Ownership,
) -> DepartmentList:
    workspace, _root = workspace_for(session, user, workspace_id)
    need_workspace_level(user, workspace.id, "workspace", "manage")
    department = _department(session, workspace.id, department_id)
    session.execute(
        delete(DepartmentOwnership).where(
            DepartmentOwnership.department_id == department.id
        )
    )
    unique = {(item.kind, item.key) for item in ownership.resources}
    session.add_all(
        DepartmentOwnership(
            department_id=department.id, resource_kind=kind, resource_key=key
        )
        for kind, key in sorted(unique)
    )
    audit(
        session,
        user,
        "department_ownership_changed",
        {
            "workspace_id": workspace.id,
            "department_id": department.id,
            "resources": sorted(f"{kind}:{key}" for kind, key in unique),
        },
    )
    session.commit()
    return list_departments(session, user, workspace.id)


def workspace_departments(
    session: Session, workspace_id: str, *, archived: bool = False
) -> list[Department]:
    query = select(Department).where(Department.workspace_id == workspace_id)
    if not archived:
        query = query.where(Department.archived_at.is_(None))
    return list(session.scalars(query.order_by(func.lower(Department.name))))


def _department(session: Session, workspace_id: str, department_id: int) -> Department:
    department = session.get(Department, department_id)
    if department is None or department.workspace_id != workspace_id:
        raise WorkspaceError("DEPARTMENT_NOT_FOUND", 404)
    return department


def _named(session: Session, workspace_id: str, name: str) -> Department | None:
    return session.scalar(
        select(Department).where(
            Department.workspace_id == workspace_id,
            func.lower(Department.name) == name.lower(),
        )
    )


def _country(session: Session, workspace_id: str) -> str:
    workspace = session.get(WorkspaceRecord, workspace_id)
    return workspace.country_code if workspace and workspace.country_code else ""


def _clean(name: str) -> str:
    clean = re.sub(r"\s+", " ", name).strip()
    if len(clean) < 2 or len(clean) > 120:
        raise WorkspaceError("DEPARTMENT_NAME_INVALID", 422)
    return clean


def _forget_members(session: Session, department_id: int) -> None:
    for user_id in session.scalars(
        select(Membership.user_id)
        .join(MembershipDepartment, MembershipDepartment.membership_id == Membership.id)
        .where(MembershipDepartment.department_id == department_id)
    ):
        forget(user_id)
