"""End-to-end tests for access read from CHART's database (docs/access-control.md).

Through the FastAPI app and a real database (SQLite per test, or a migrated
PostgreSQL/PostGIS database when ``CHART_E2E_DATABASE_URL`` is set): a new
workspace's seeded roles and departments, grants at places (covering below,
read-only above, nothing beside), the higher of overlapping grants, the
department rule for writes, platform admins, disabled and unknown accounts,
and a changed grant taking effect once the cached access is dropped.
"""

from __future__ import annotations

import os
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from chart.access import principal as access
from chart.access.capabilities import DEFAULT_DEPARTMENTS, DEFAULT_ROLES, MODULES
from chart.access.workspaces import ensure_workspace
from chart.api.app import app
from chart.access.signin import SignIn
from chart.auth import service as auth_service
from chart.shared.db import session as db_session
from chart.shared.db.base import Base
from chart.shared.db.models import (
    AccessRole,
    AccessRoleCapability,
    AppGeography,
    AppUser,
    CountryGeoConfig,
    Department,
    Membership,
    MembershipDepartment,
    MembershipGrant,
)

PLACES = (
    ("geo-in", "IN", "country", "India", None, "/india"),
    ("geo-in-mp", "IN", "state", "Madhya Pradesh", "geo-in", "/india/madhya-pradesh"),
    (
        "geo-in-mp-bhopal",
        "IN",
        "division",
        "Bhopal",
        "geo-in-mp",
        "/india/madhya-pradesh/bhopal",
    ),
    (
        "geo-in-mp-indore",
        "IN",
        "division",
        "Indore",
        "geo-in-mp",
        "/india/madhya-pradesh/indore",
    ),
    ("geo-in-gj", "IN", "state", "Gujarat", "geo-in", "/india/gujarat"),
    ("geo-ke", "KE", "country", "Kenya", None, "/kenya"),
)
# user: (grants as (role key, geography), departments, status, platform admin)
PEOPLE = {
    "priya": (
        [("planning_lead", "geo-in-mp-bhopal"), ("viewer", "geo-in-mp")],
        [],
        "active",
        False,
    ),
    "ravi": ([("implementation_officer", "geo-in-mp")], ["Water"], "active", False),
    "dina": ([("data_officer", "geo-in-mp")], ["Health"], "active", False),
    "gone": ([("planning_lead", "geo-in")], [], "disabled", False),
    "root": ([], [], "active", True),
}


@pytest.fixture
def factory(tmp_path, monkeypatch):
    url = os.getenv("CHART_E2E_DATABASE_URL") or f"sqlite:///{tmp_path / 'access.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    engine = db_session.get_engine(url)
    if url.startswith("postgresql"):
        with engine.begin() as connection:
            for table in reversed(Base.metadata.sorted_tables):
                connection.execute(table.delete())
    else:
        Base.metadata.create_all(engine)
    access.forget()
    make = db_session.get_session_factory()
    with make() as session:
        for code, level in {(p[1], p[2]) for p in PLACES}:
            session.add(
                CountryGeoConfig(
                    country_code=code, level_key=level, level_label=level.title()
                )
            )
        session.flush()
        for id_, code, level, name, parent, path in PLACES:
            session.add(
                AppGeography(
                    id=id_,
                    country_code=code,
                    level=level,
                    level_label=level.title(),
                    name=name,
                    parent_id=parent,
                    path=path,
                )
            )
            session.flush()
        workspace = ensure_workspace(session, "IN")
        roles = {
            role.key: role.id
            for role in session.scalars(
                select(AccessRole).where(AccessRole.workspace_id == workspace.id)
            )
        }
        departments = {
            row.name: row.id
            for row in session.scalars(
                select(Department).where(Department.workspace_id == workspace.id)
            )
        }
        for user_id, (grants, names, status, platform) in PEOPLE.items():
            session.add(
                AppUser(
                    id=user_id,
                    username=user_id,
                    email=f"{user_id}@example.org",
                    display_name=user_id.title(),
                    status=status,
                    is_platform_admin=platform,
                )
            )
            session.flush()
            if not grants:
                continue
            membership = Membership(
                user_id=user_id, workspace_id=workspace.id, status="active"
            )
            session.add(membership)
            session.flush()
            session.add_all(
                MembershipGrant(
                    membership_id=membership.id, role_id=roles[key], geography_id=geo
                )
                for key, geo in grants
            )
            session.add_all(
                MembershipDepartment(
                    membership_id=membership.id, department_id=departments[name]
                )
                for name in names
            )
        session.commit()
    yield make
    access.forget()


@pytest.fixture
def as_user(factory, monkeypatch) -> Iterator:
    """A client signed in as the user: only the Keycloak token check is
    stood in for; access is loaded from the database as in production."""

    monkeypatch.setattr(
        auth_service,
        "verify_keycloak_token",
        lambda token, _config: SignIn(
            user_id=token,
            username=token,
            email=f"{token}@example.org",
            email_verified=True,
            display_name=None,
        ),
    )

    def sign_in(user_id: str) -> TestClient:
        return TestClient(app, headers={"Authorization": f"Bearer {user_id}"})

    yield sign_in


def _department_id(factory, name: str) -> int:
    with factory() as session:
        return session.scalar(select(Department.id).where(Department.name == name))


def test_a_new_workspace_is_seeded_once_with_the_default_roles_and_departments(
    factory,
) -> None:
    with factory() as session:
        again = ensure_workspace(session, "IN")
        session.commit()
        assert again.id == "workspace-in"
        assert again.name == "India"
        roles = session.scalars(
            select(AccessRole).where(AccessRole.workspace_id == again.id)
        ).all()
        assert sorted(role.key for role in roles) == sorted(DEFAULT_ROLES)
        lead = next(role for role in roles if role.key == "planning_lead")
        levels = dict(
            session.execute(
                select(AccessRoleCapability.module, AccessRoleCapability.level).where(
                    AccessRoleCapability.role_id == lead.id
                )
            ).all()
        )
        assert levels["actions"] == "manage"
        assert levels["people"] == "write"
        assert levels["data"] == "read"
        assert "workspace" not in levels
        names = session.scalars(
            select(Department.name).where(Department.workspace_id == again.id)
        ).all()
        assert sorted(names) == sorted(DEFAULT_DEPARTMENTS)

        # A country with departments already keeps them and gets no seed.
        session.add(Department(country_code="KE", name="County health"))
        session.flush()
        kenya = ensure_workspace(session, "KE")
        session.commit()
        assert session.scalars(
            select(Department.name).where(Department.workspace_id == kenya.id)
        ).all() == ["County health"]


def _levels(client: TestClient, place: str) -> dict[str, str]:
    """The level held per module at a place, asked one check at a time."""

    levels = {}
    for module in MODULES:
        for level in ("manage", "write", "read"):
            answer = client.get(
                "/access/check",
                params={"module": module, "level": level, "place": place},
            ).json()
            if answer["allowed"]:
                levels[module] = level
                break
    return levels


def test_grants_cover_below_read_above_and_reach_nothing_beside(as_user) -> None:
    client = as_user("priya")
    body = client.get("/auth/me").json()
    assert body["isPlatformAdmin"] is False
    [workspace] = body["workspaces"]
    assert workspace["countryCode"] == "IN"
    assert [(g["placeName"], g["roleName"]) for g in workspace["grants"]] == [
        ("Madhya Pradesh", "Viewer"),
        ("Bhopal", "Planning lead"),
    ]
    assert body["geographyScopes"] == [
        "/india/madhya-pradesh",
        "/india/madhya-pradesh/bhopal",
    ]

    def at(place: str) -> dict[str, str]:
        return _levels(client, place)

    # Lead in Bhopal and below; the higher of overlapping grants wins.
    bhopal = at("/india/madhya-pradesh/bhopal/huzur")
    assert bhopal["risk"] == "write"
    assert bhopal["actions"] == "manage"
    assert bhopal["people"] == "write"
    # Viewer for the rest of the state.
    indore = at("/india/madhya-pradesh/indore")
    assert indore["risk"] == "read"
    assert indore["actions"] == "read"
    # The country above is read-only context.
    assert set(at("/india").values()) == {"read"}
    # Nothing beside the grants, nor in another country.
    assert at("/india/gujarat") == {}
    assert at("/kenya") == {}


def test_writes_to_an_owned_resource_need_one_of_its_departments(
    as_user, factory
) -> None:
    water = _department_id(factory, "Water")
    health = _department_id(factory, "Health")
    place = "/india/madhya-pradesh/bhopal"

    def check(user: str, module: str, level: str, departments: list[int]):
        return (
            as_user(user)
            .get(
                "/access/check",
                params={
                    "module": module,
                    "level": level,
                    "place": place,
                    "department": departments,
                },
            )
            .json()
        )

    # Ravi (Water) starts Water's actions, not Health's; an unowned one is open.
    assert check("ravi", "actions", "write", [water])["allowed"] is True
    assert check("ravi", "actions", "write", [health]) == {
        "allowed": False,
        "code": "CAPABILITY_NOT_ALLOWED",
    }
    assert check("ravi", "actions", "write", [])["allowed"] is True
    # Dina (Health, data officer) uploads Health's sources only.
    assert check("dina", "data", "write", [health])["allowed"] is True
    assert check("dina", "vra", "write", [water])["allowed"] is False
    # Managing a module covers every department: Priya leads actions in Bhopal.
    assert check("priya", "actions", "write", [health])["allowed"] is True
    # Departments never narrow reads, and never lift a missing level.
    assert check("ravi", "data", "read", [health])["allowed"] is True
    assert check("ravi", "data", "write", [water])["allowed"] is False


def test_platform_admins_manage_everywhere_and_disabled_or_unknown_hold_nothing(
    as_user,
) -> None:
    root = as_user("root")
    assert root.get("/auth/me").json()["isPlatformAdmin"] is True
    assert set(_levels(root, "/kenya").values()) == {"manage"}

    gone = as_user("gone").get("/auth/me").json()
    assert gone["status"] == "disabled"
    assert _levels(as_user("gone"), "/india") == {}
    assert as_user("gone").get(
        "/access/check",
        params={"module": "risk", "level": "read", "place": "/india"},
    ).json() == {"allowed": False, "code": "ACCOUNT_DISABLED"}

    # Invitation only: a Keycloak account CHART never invited holds nothing.
    stranger = as_user("stranger").get("/auth/me")
    assert stranger.status_code == 200
    assert stranger.json()["workspaces"] == []
    assert stranger.json()["geographyScopes"] == []
    assert _levels(as_user("stranger"), "/india") == {}


def test_a_changed_grant_takes_effect_once_cached_access_is_dropped(
    as_user, factory
) -> None:
    client = as_user("ravi")
    place = "/india/madhya-pradesh"
    assert _levels(client, place)["actions"] == "write"
    with factory() as session:
        viewer = session.scalar(select(AccessRole.id).where(AccessRole.key == "viewer"))
        grant = session.scalar(
            select(MembershipGrant)
            .join(Membership, Membership.id == MembershipGrant.membership_id)
            .where(Membership.user_id == "ravi")
        )
        grant.role_id = viewer
        session.commit()
    # Cached for a few seconds until the change drops it.
    assert _levels(client, place)["actions"] == "write"
    access.forget("ravi")
    assert _levels(client, place)["actions"] == "read"


def test_access_needs_a_signed_in_person_and_valid_questions(as_user) -> None:
    assert TestClient(app).get("/auth/me").status_code == 401
    bad = as_user("priya").get(
        "/access/check",
        params={"module": "rockets", "level": "read", "place": "/india"},
    )
    assert bad.status_code == 422
