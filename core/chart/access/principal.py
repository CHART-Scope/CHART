"""The signed-in person's access, loaded from the database, and the one check.

Keycloak proves who someone is; what they may do is read here on every
request (cached for a few seconds and cleared when their access changes),
so a new grant or a disabled account takes effect at once.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass, field
from threading import Lock

from sqlalchemy import select
from sqlalchemy.orm import Session

from chart.shared.db.models import (
    AccessRole,
    AccessRoleCapability,
    AppGeography,
    AppUser,
    Department,
    Membership,
    MembershipDepartment,
    MembershipGrant,
    WorkspaceRecord,
)

from .capabilities import DEPARTMENT_SCOPED, RANK, higher

CACHE_SECONDS = 30.0


@dataclass(frozen=True)
class Grant:
    geography_id: str
    path: str
    place_name: str
    role_key: str
    role_name: str
    levels: dict[str, str]


@dataclass(frozen=True)
class WorkspaceAccess:
    workspace_id: str
    country_code: str
    name: str
    grants: tuple[Grant, ...]
    departments: dict[int, str]


@dataclass(frozen=True)
class Principal:
    user_id: str
    status: str = "active"
    is_platform_admin: bool = False
    workspaces: tuple[WorkspaceAccess, ...] = field(default_factory=tuple)
    # The places the person works from, broadest first: their grants, or for
    # a platform admin every workspace's country.
    scope_roots: tuple[str, ...] = field(default_factory=tuple)
    # False for a Keycloak account CHART has no row for (never invited).
    registered: bool = True

    @property
    def active(self) -> bool:
        return self.status == "active"


class AccessDenied(PermissionError):
    def __init__(self, code: str = "CAPABILITY_NOT_ALLOWED") -> None:
        super().__init__(code)
        self.code = code


_cache: dict[str, tuple[float, Principal]] = {}
_lock = Lock()


def load_principal(
    session: Session,
    user_id: str,
    on_miss: Callable[[Session], None] | None = None,
) -> Principal:
    """The person's access; ``on_miss`` runs before a fresh read (sign-in
    linking: accepting invitations, recording the visit)."""

    now = time.monotonic()
    with _lock:
        hit = _cache.get(user_id)
    if hit and hit[0] > now:
        return hit[1]
    if on_miss is not None:
        on_miss(session)
    principal = _read(session, user_id)
    if principal.registered:
        # An unregistered account is re-read each time, so an invitation sent
        # moments after a first sign-in applies on the next request.
        with _lock:
            _cache[user_id] = (now + CACHE_SECONDS, principal)
    return principal


def forget(user_id: str | None = None) -> None:
    """Drop cached access: call after changing someone's grants or status."""

    with _lock:
        if user_id is None:
            _cache.clear()
        else:
            _cache.pop(user_id, None)


def level_at(principal: Principal, module: str, place: str) -> str | None:
    """The person's level on a module at a place.

    A grant covers its place and everything below it. Places above a grant
    are readable for context, at most at read level.
    """

    if not principal.active:
        return None
    if principal.is_platform_admin:
        return "manage"
    target = normalize(place)
    best: str | None = None
    for workspace in principal.workspaces:
        for grant in workspace.grants:
            level = grant.levels.get(module)
            if level is None:
                continue
            if _covers(grant.path, target):
                best = higher(best, level)
            elif _covers(target, grant.path):
                best = higher(best, "read")
    return best


def readable(principal: Principal, place: str) -> bool:
    """Whether any module is readable at the place."""

    return any(level_at(principal, module, place) is not None for module in _modules())


def departments_at(principal: Principal, place: str) -> set[int]:
    target = normalize(place)
    return {
        department
        for workspace in principal.workspaces
        if any(_covers(grant.path, target) for grant in workspace.grants)
        for department in workspace.departments
    }


def authorize(
    principal: Principal,
    module: str,
    level: str,
    place: str,
    departments: set[int] | None = None,
) -> bool:
    """Whether the person holds ``level`` on ``module`` at ``place``.

    ``departments`` are the owning departments of the resource written (an
    action, data source or VRA indicator group); writes to an owned resource
    need one of them unless the person manages the module.
    """

    held = level_at(principal, module, place)
    if held is None or RANK[held] < RANK[level]:
        return False
    if (
        module in DEPARTMENT_SCOPED
        and level == "write"
        and departments
        and held != "manage"
        and not principal.is_platform_admin
    ):
        return bool(departments & departments_at(principal, place))
    return True


def require(
    principal: Principal,
    module: str,
    level: str,
    place: str,
    departments: set[int] | None = None,
) -> None:
    if not principal.active:
        raise AccessDenied("ACCOUNT_DISABLED")
    if not authorize(principal, module, level, place, departments):
        raise AccessDenied()


def _modules() -> tuple[str, ...]:
    from .capabilities import MODULES

    return MODULES


def normalize(path: str) -> str:
    return "/" + "/".join(part for part in path.split("/") if part)


def _covers(scope: str, place: str) -> bool:
    return scope == "/" or place == scope or place.startswith(f"{scope}/")


def _read(session: Session, user_id: str) -> Principal:
    user = session.get(AppUser, user_id)
    if user is None:
        # Invitation only: an unknown account holds nothing.
        return Principal(user_id=user_id, registered=False)
    memberships = session.execute(
        select(Membership, WorkspaceRecord)
        .join(WorkspaceRecord, WorkspaceRecord.id == Membership.workspace_id)
        .where(Membership.user_id == user_id, Membership.status == "active")
        .order_by(WorkspaceRecord.name)
    ).all()
    ids = [membership.id for membership, _ in memberships]
    grants: dict[int, list[Grant]] = {}
    role_levels: dict[int, dict[str, str]] = {}
    rows = session.execute(
        select(MembershipGrant, AccessRole, AppGeography)
        .join(AccessRole, AccessRole.id == MembershipGrant.role_id)
        .join(AppGeography, AppGeography.id == MembershipGrant.geography_id)
        .where(MembershipGrant.membership_id.in_(ids))
        .order_by(AppGeography.path)
    ).all()
    for role_id, module, level in session.execute(
        select(
            AccessRoleCapability.role_id,
            AccessRoleCapability.module,
            AccessRoleCapability.level,
        ).where(AccessRoleCapability.role_id.in_({role.id for _, role, _ in rows}))
    ):
        role_levels.setdefault(role_id, {})[module] = level
    for grant, role, place in rows:
        grants.setdefault(grant.membership_id, []).append(
            Grant(
                geography_id=place.id,
                path=normalize(place.path),
                place_name=place.name,
                role_key=role.key,
                role_name=role.name,
                levels=role_levels.get(role.id, {}),
            )
        )
    departments: dict[int, dict[int, str]] = {}
    for membership_id, department_id, name in session.execute(
        select(MembershipDepartment.membership_id, Department.id, Department.name)
        .join(Department, Department.id == MembershipDepartment.department_id)
        .where(
            MembershipDepartment.membership_id.in_(ids),
            Department.archived_at.is_(None),
        )
    ):
        departments.setdefault(membership_id, {})[department_id] = name
    paths = [grant.path for items in grants.values() for grant in items]
    if user.is_platform_admin:
        paths = [*_workspace_roots(session), *_model_roots(session)]
    return Principal(
        user_id=user.id,
        status=user.status,
        is_platform_admin=user.is_platform_admin,
        scope_roots=tuple(
            sorted(dict.fromkeys(paths), key=lambda path: (path.count("/"), path))
        ),
        workspaces=tuple(
            WorkspaceAccess(
                workspace_id=workspace.id,
                country_code=workspace.country_code or "",
                name=workspace.name,
                grants=tuple(grants.get(membership.id, [])),
                departments=departments.get(membership.id, {}),
            )
            for membership, workspace in memberships
        ),
    )


def _workspace_roots(session: Session) -> list[str]:
    return [
        normalize(path)
        for path in session.scalars(
            select(AppGeography.path)
            .join(WorkspaceRecord, WorkspaceRecord.geography_id == AppGeography.id)
            .where(WorkspaceRecord.country_code.is_not(None))
        )
    ]


def _model_roots(session: Session) -> list[str]:
    """Countries with an active model, so a platform admin can open them
    before their workspace is set up. Never fails a sign-in."""

    try:
        from chart.model_registry.service import list_family_roots_with_active_models

        return [normalize(p) for p in list_family_roots_with_active_models(session)]
    except Exception:
        return []
