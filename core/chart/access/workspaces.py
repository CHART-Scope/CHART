"""One workspace per country, seeded with the default roles and departments."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from chart.shared.db.models import (
    AccessRole,
    AccessRoleCapability,
    AppGeography,
    Department,
    WorkspaceRecord,
)

from .capabilities import DEFAULT_DEPARTMENTS, DEFAULT_ROLES


def ensure_workspace(
    session: Session, country_code: str, created_by: str | None = None
) -> WorkspaceRecord:
    """The country's workspace, created with its defaults the first time.

    Idempotent: roles and departments are only seeded with a new workspace,
    so a list its members have changed is never reseeded.
    """

    code = country_code.upper()
    existing = session.scalar(
        select(WorkspaceRecord).where(WorkspaceRecord.country_code == code)
    )
    if existing is not None:
        return existing
    country = session.scalar(
        select(AppGeography).where(
            AppGeography.level == "country", AppGeography.country_code == code
        )
    )
    workspace = WorkspaceRecord(
        id=f"workspace-{code.lower()}",
        name=country.name if country else code,
        country_code=code,
        geography_id=country.id if country else None,
        status="active",
        created_by_user_id=created_by,
    )
    session.add(workspace)
    session.flush()
    for key, (name, levels) in DEFAULT_ROLES.items():
        role = AccessRole(
            workspace_id=workspace.id, key=key, name=name, is_default=True
        )
        session.add(role)
        session.flush()
        session.add_all(
            AccessRoleCapability(role_id=role.id, module=module, level=level)
            for module, level in levels.items()
        )
    # A country's departments from before workspaces move into it as they are.
    departments = session.scalars(
        select(Department).where(Department.country_code == code)
    ).all()
    for department in departments:
        department.workspace_id = workspace.id
    if not departments:
        session.add_all(
            Department(country_code=code, workspace_id=workspace.id, name=name)
            for name in DEFAULT_DEPARTMENTS
        )
    session.flush()
    return workspace
