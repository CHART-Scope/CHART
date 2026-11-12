"""Signed-in people for API tests that stand in for Keycloak and the database.

Routes read access from ``user.access`` (docs/access-control.md); these build
it from the default roles, so a test names a role at a place instead of
seeding memberships. ``chart.access`` loading from the database is covered by
test_access_api.py.
"""

from __future__ import annotations

from collections.abc import Iterable

from chart.access.capabilities import DEFAULT_ROLES
from chart.access.guards import context_for
from chart.access.principal import Grant, Principal, WorkspaceAccess, normalize
from chart.auth.schemas import CurrentUserContext


def member(
    user_id: str,
    role: str,
    places: Iterable[str],
    *,
    grants: Iterable[tuple[str, str]] = (),
    departments: dict[int, str] | None = None,
    email: str | None = None,
    status: str = "active",
) -> CurrentUserContext:
    """A member holding ``role`` at each place, plus any extra (role, place)."""

    pairs = [(role, place) for place in places] + list(grants)
    built = tuple(
        Grant(
            geography_id=normalize(place),
            path=normalize(place),
            place_name=normalize(place).rsplit("/", 1)[-1] or "Everywhere",
            role_key=key,
            role_name=DEFAULT_ROLES[key][0],
            levels=dict(DEFAULT_ROLES[key][1]),
        )
        for key, place in pairs
    )
    principal = Principal(
        user_id=user_id,
        status=status,
        workspaces=(
            (
                WorkspaceAccess(
                    workspace_id="workspace-test",
                    country_code="",
                    name="Test",
                    grants=built,
                    departments=departments or {},
                ),
            )
            if built
            else ()
        ),
        scope_roots=tuple(dict.fromkeys(grant.path for grant in built)),
    )
    return context_for(principal, username=user_id, email=email)


def platform_admin(
    user_id: str = "admin", *, roots: Iterable[str] = ("/",)
) -> CurrentUserContext:
    principal = Principal(
        user_id=user_id,
        is_platform_admin=True,
        scope_roots=tuple(normalize(root) for root in roots),
    )
    return context_for(principal, username=user_id)


def nobody(user_id: str = "stranger") -> CurrentUserContext:
    """Signed in with Keycloak but never invited: holds nothing."""

    return context_for(Principal(user_id=user_id), username=user_id)
