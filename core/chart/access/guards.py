"""Checks routes call with the signed-in person (``CurrentUserContext``).

The person's access rides on the context (``user.access``), loaded from the
database by ``chart.auth.service``; routes never compare role names.
"""

from __future__ import annotations

from fastapi import HTTPException

from chart.auth.schemas import CurrentUserContext

from .capabilities import MODULES, RANK
from .principal import Grant, Principal, WorkspaceAccess, authorize, level_at
from .principal import readable as _readable

# Signed-out visitors on an open installation (CHART_PUBLIC_READ) read
# published estimates, assessments, actions and heat seasons everywhere.
PUBLIC_PRINCIPAL = Principal(
    user_id="public",
    scope_roots=("/",),
    workspaces=(
        WorkspaceAccess(
            workspace_id="public",
            country_code="",
            name="Public",
            grants=(
                Grant(
                    geography_id="",
                    path="/",
                    place_name="Everywhere",
                    role_key="public",
                    role_name="Public visitor",
                    levels={
                        "risk": "read",
                        "actions": "read",
                        "seasons": "read",
                        "vra": "read",
                    },
                ),
            ),
            departments={},
        ),
    ),
)


def context_for(
    principal: Principal,
    *,
    username: str,
    email: str | None = None,
    display_name: str | None = None,
) -> CurrentUserContext:
    scopes = list(principal.scope_roots)
    first = scopes[0] if scopes else None
    return CurrentUserContext.model_validate(
        {
            "user_id": principal.user_id,
            "username": username,
            "email": email,
            "display_name": display_name or username,
            "status": principal.status,
            "is_platform_admin": principal.is_platform_admin,
            "geography_scopes": scopes,
            "active_geography_id": first,
            "workspaces": [
                {
                    "workspace_id": workspace.workspace_id,
                    "country_code": workspace.country_code,
                    "name": workspace.name,
                    "grants": [
                        {
                            "geography_id": grant.geography_id,
                            "place_path": grant.path,
                            "place_name": grant.place_name,
                            "role_key": grant.role_key,
                            "role_name": grant.role_name,
                            "capabilities": grant.levels,
                        }
                        for grant in workspace.grants
                    ],
                    "departments": [
                        {"id": id_, "name": name}
                        for id_, name in sorted(
                            workspace.departments.items(), key=lambda item: item[1]
                        )
                    ],
                }
                for workspace in principal.workspaces
            ],
            "access": principal,
        }
    )


PUBLIC_VISITOR = context_for(PUBLIC_PRINCIPAL, username="public")


def principal_of(user: CurrentUserContext) -> Principal:
    return (
        user.access if isinstance(user.access, Principal) else Principal(user.user_id)
    )


def can(
    user: CurrentUserContext,
    module: str,
    level: str,
    place: str,
    departments: set[int] | None = None,
) -> bool:
    return authorize(principal_of(user), module, level, place, departments)


def can_read_place(user: CurrentUserContext, place: str) -> bool:
    return _readable(principal_of(user), place)


def require_capability(
    user: CurrentUserContext,
    module: str,
    level: str,
    place: str,
    departments: set[int] | None = None,
) -> None:
    principal = principal_of(user)
    if not principal.active:
        raise HTTPException(status_code=403, detail="ACCOUNT_DISABLED")
    if authorize(principal, module, level, place, departments):
        return
    # Holding the module somewhere else reads as a place outside one's area.
    elsewhere = any(
        grant.levels.get(module) for w in principal.workspaces for grant in w.grants
    )
    held = level_at(principal, module, place)
    code = (
        "GEOGRAPHY_OUT_OF_SCOPE"
        if elsewhere and held is None
        else "CAPABILITY_NOT_ALLOWED"
    )
    raise HTTPException(status_code=403, detail=code)


def require_somewhere(user: CurrentUserContext, module: str, level: str) -> None:
    """Refuse early, before a place is looked up, when the person holds the
    level nowhere."""

    principal = principal_of(user)
    if principal.is_platform_admin:
        return
    if not principal.active:
        raise HTTPException(status_code=403, detail="ACCOUNT_DISABLED")
    if not any(
        RANK[grant.levels[module]] >= RANK[level]
        for workspace in principal.workspaces
        for grant in workspace.grants
        if module in grant.levels
    ):
        raise HTTPException(status_code=403, detail="CAPABILITY_NOT_ALLOWED")


def require_platform_admin(user: CurrentUserContext) -> None:
    principal = principal_of(user)
    if not (principal.active and principal.is_platform_admin):
        raise HTTPException(status_code=403, detail="PLATFORM_ADMIN_REQUIRED")


__all__ = [
    "MODULES",
    "PUBLIC_VISITOR",
    "can",
    "can_read_place",
    "context_for",
    "principal_of",
    "require_capability",
    "require_platform_admin",
]
