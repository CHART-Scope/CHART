"""End-to-end tests for workspaces, members, invitations and departments.

Through the FastAPI app and a real database (SQLite per test, or a migrated
PostgreSQL/PostGIS database when ``CHART_E2E_DATABASE_URL`` is set). Only
Keycloak is stood in for: a bearer token names a sign-in, and the account,
invitation-email and sign-out calls are recorded. Everything after the token
is real: loading access from the database, accepting invitations at first
sign-in, the grant and department rules, and the audit trail.
"""

from __future__ import annotations

import os
import threading
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from chart.access import principal as access
from chart.access import signin as signin_module
from chart.access.signin import SignIn
from chart.api.app import app
from chart.auth import service as auth_service
from chart.identity.service import IdentityUser
from chart.shared.db import session as db_session
from chart.shared.db.base import Base
from chart.shared.db.models import (
    AppGeography,
    AppUser,
    AuditEventRecord,
    CountryGeoConfig,
    Invitation,
)
from chart.workspaces import people

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


def _sign_in(
    user_id: str, *, verified: bool = True, admin_role: bool = False
) -> SignIn:
    return SignIn(
        user_id=user_id,
        username=user_id,
        email=f"{user_id}@example.org",
        email_verified=verified,
        display_name=user_id.title(),
        bootstrap_admin=admin_role,
    )


@pytest.fixture
def world(tmp_path, monkeypatch):
    url = os.getenv("CHART_E2E_DATABASE_URL") or f"sqlite:///{tmp_path / 'ws.db'}"
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
        session.add(
            AppUser(
                id="root",
                username="root",
                email="root@example.org",
                display_name="Root",
                status="active",
                is_platform_admin=True,
            )
        )
        session.commit()

    sign_ins = {
        "root": _sign_in("root"),
        "priya": _sign_in("priya"),
        "ravi": _sign_in("ravi"),
        "kofi": _sign_in("kofi"),
        "stranger": _sign_in("stranger"),
        "unverified": _sign_in("unverified", verified=False),
        "seeded-admin": _sign_in("seeded-admin", admin_role=True),
    }
    monkeypatch.setattr(
        auth_service, "verify_keycloak_token", lambda token, _config: sign_ins[token]
    )
    emails: list[str] = []
    signed_out: list[str] = []
    accounts: list[tuple[str, str]] = []

    def ensure_account(*, name: str, email: str, operation_id=None) -> IdentityUser:
        accounts.append((name, email))
        return IdentityUser(
            user_id=email.split("@")[0], username=email, email=email, created=True
        )

    monkeypatch.setattr(people, "ensure_account", ensure_account)
    monkeypatch.setattr(
        people, "send_invitation", lambda user_id: emails.append(user_id)
    )
    monkeypatch.setattr(people, "sign_out", lambda user_id: signed_out.append(user_id))
    yield {
        "factory": make,
        "emails": emails,
        "signed_out": signed_out,
        "accounts": accounts,
    }
    access.forget()


def client_for(token: str) -> TestClient:
    return TestClient(app, headers={"Authorization": f"Bearer {token}"})


@pytest.fixture
def india(world) -> dict:
    """India's workspace with root as platform admin, and its role ids."""

    created = client_for("root").post("/workspaces", json={"country_code": "in"})
    assert created.status_code == 201, created.text
    workspace = created.json()["id"]
    roles = {
        role["key"]: role["id"]
        for role in client_for("root")
        .get(f"/workspaces/{workspace}/roles")
        .json()["items"]
    }
    departments = {
        item["name"]: item["id"]
        for item in client_for("root")
        .get(f"/workspaces/{workspace}/departments")
        .json()["items"]
    }
    return {**world, "id": workspace, "roles": roles, "departments": departments}


def _invite(token: str, workspace: str, email: str, grants, departments=(), new=()):
    return client_for(token).post(
        f"/workspaces/{workspace}/invitations",
        json={
            "email": email,
            "name": email.split("@")[0].title(),
            "grants": [{"role_id": r, "geography_id": g} for r, g in grants],
            "department_ids": list(departments),
            "new_departments": list(new),
        },
    )


def _me(token: str) -> dict:
    response = client_for(token).get("/auth/me")
    assert response.status_code == 200, response.text
    return response.json()


def _join(india: dict, user: str, role: str, place: str, departments=()) -> None:
    response = _invite(
        "root",
        india["id"],
        f"{user}@example.org",
        [(india["roles"][role], place)],
        [india["departments"][name] for name in departments],
    )
    assert response.status_code == 201, response.text
    _me(user)  # first sign-in accepts it


def test_a_platform_admin_creates_a_country_workspace_with_its_defaults(world) -> None:
    root = client_for("root")
    created = root.post("/workspaces", json={"country_code": "IN"})
    assert created.status_code == 201
    assert created.json()["name"] == "India"
    assert created.json()["place_path"] == "/india"
    roles = root.get(f"/workspaces/{created.json()['id']}/roles").json()
    assert [role["name"] for role in roles["items"]] == [
        "Workspace admin",
        "Planning lead",
        "Implementation officer",
        "Data officer",
        "Viewer",
    ]
    assert roles["items"][2]["capabilities"]["actions"] == "write"
    assert root.post("/workspaces", json={"country_code": "IN"}).status_code == 409
    assert root.post("/workspaces", json={"country_code": "FR"}).status_code == 404
    assert [w["country_code"] for w in root.get("/workspaces").json()["items"]] == [
        "IN"
    ]
    # Anyone else: refused, and an unknown workspace reads as missing.
    assert client_for("stranger").post(
        "/workspaces", json={"country_code": "KE"}
    ).json() == {"error": "PLATFORM_ADMIN_REQUIRED"}
    assert (
        client_for("stranger")
        .get(f"/workspaces/{created.json()['id']}/roles")
        .status_code
        == 404
    )


def test_an_invitation_is_accepted_at_first_sign_in_with_its_grants_and_departments(
    india,
) -> None:
    water = india["departments"]["Water"]
    invited = _invite(
        "root",
        india["id"],
        "Priya@Example.org",
        [(india["roles"]["planning_lead"], "geo-in-mp")],
        [water],
        ["Hydrology"],
    )
    assert invited.status_code == 201, invited.text
    body = invited.json()
    assert body["status"] == "pending"
    assert body["email"] == "priya@example.org"
    assert body["email_sent"] is True
    assert sorted(d["name"] for d in body["departments"]) == ["Hydrology", "Water"]
    assert india["emails"] == ["priya"]
    # Inviting again while pending is refused.
    again = _invite(
        "root", india["id"], "priya@example.org", [(india["roles"]["viewer"], "geo-in")]
    )
    assert again.json() == {"error": "INVITATION_PENDING"}

    me = _me("priya")
    [workspace] = me["workspaces"]
    assert workspace["workspaceId"] == india["id"]
    assert [(g["placeName"], g["roleName"]) for g in workspace["grants"]] == [
        ("Madhya Pradesh", "Planning lead")
    ]
    assert workspace["grants"][0]["capabilities"]["people"] == "write"
    assert sorted(d["name"] for d in workspace["departments"]) == ["Hydrology", "Water"]
    assert me["geographyScopes"] == ["/india/madhya-pradesh"]
    invitations = client_for("root").get(f"/workspaces/{india['id']}/invitations")
    assert invitations.json()["items"][0]["status"] == "accepted"
    members = client_for("root").get(f"/workspaces/{india['id']}/members").json()
    assert [m["display_name"] for m in members["items"]] == ["Priya"]
    with india["factory"]() as session:
        assert (
            session.scalar(
                select(func.count())
                .select_from(AuditEventRecord)
                .where(AuditEventRecord.event_type == "invitation_created")
            )
            == 1
        )


def test_signing_in_uninvited_or_unverified_grants_nothing_and_creates_no_account(
    india,
) -> None:
    _invite(
        "root",
        india["id"],
        "unverified@example.org",
        [(india["roles"]["viewer"], "geo-in")],
    )
    assert _me("stranger")["workspaces"] == []
    assert _me("unverified")["workspaces"] == []
    with india["factory"]() as session:
        assert session.get(AppUser, "stranger") is None
        assert session.get(AppUser, "unverified") is None
    assert (
        client_for("stranger")
        .get("/access/check?module=risk&level=read&place=/india")
        .json()["allowed"]
        is False
    )
    # Invited moments after a first sign-in: applies on the next request.
    _invite(
        "root",
        india["id"],
        "stranger@example.org",
        [(india["roles"]["viewer"], "geo-in")],
    )
    assert len(_me("stranger")["workspaces"]) == 1


def test_nobody_grants_more_than_they_hold_or_outside_their_places(india) -> None:
    _join(india, "priya", "planning_lead", "geo-in-mp")
    roles = india["roles"]
    # Priya leads Madhya Pradesh: a Workspace admin grant exceeds her.
    assert _invite(
        "priya",
        india["id"],
        "kofi@example.org",
        [(roles["workspace_admin"], "geo-in-mp")],
    ).json() == {"error": "GRANT_EXCEEDS_YOUR_ACCESS"}
    # Gujarat is outside her places; Kenya is outside the workspace.
    assert _invite(
        "priya", india["id"], "kofi@example.org", [(roles["viewer"], "geo-in-gj")]
    ).json() == {"error": "CAPABILITY_NOT_ALLOWED"}
    assert _invite(
        "priya", india["id"], "kofi@example.org", [(roles["viewer"], "geo-ke")]
    ).json() == {"error": "GRANT_PLACE_INVALID"}
    # An officer in Bhopal is within both.
    ok = _invite(
        "priya",
        india["id"],
        "kofi@example.org",
        [(roles["implementation_officer"], "geo-in-mp-bhopal")],
    )
    assert ok.status_code == 201, ok.text
    # Inviting needs people write: an officer cannot.
    _me("kofi")
    assert _invite(
        "kofi", india["id"], "ravi@example.org", [(roles["viewer"], "geo-in-mp-bhopal")]
    ).json() == {"error": "CAPABILITY_NOT_ALLOWED"}


def test_changing_a_member_needs_people_manage_and_takes_effect_at_once(india) -> None:
    _join(india, "priya", "planning_lead", "geo-in-mp")
    _join(india, "ravi", "viewer", "geo-in-mp-bhopal", ["Water"])
    roles = india["roles"]
    change = {
        "grants": [
            {
                "role_id": roles["implementation_officer"],
                "geography_id": "geo-in-mp-bhopal",
            },
            {"role_id": roles["viewer"], "geography_id": "geo-in-mp"},
        ],
        "department_ids": [india["departments"]["Health"]],
    }
    path = f"/workspaces/{india['id']}/members/ravi"
    # A planning lead invites but does not manage people.
    assert client_for("priya").put(path, json=change).json() == {
        "error": "CAPABILITY_NOT_ALLOWED"
    }
    assert _me("ravi")["workspaces"][0]["grants"][0]["roleKey"] == "viewer"
    changed = client_for("root").put(path, json=change)
    assert changed.status_code == 200, changed.text
    assert [(g["place_name"], g["role_name"]) for g in changed.json()["grants"]] == [
        ("Madhya Pradesh", "Viewer"),
        ("Bhopal", "Implementation officer"),
    ]
    me = _me("ravi")["workspaces"][0]
    assert {g["roleKey"] for g in me["grants"]} == {"viewer", "implementation_officer"}
    assert [d["name"] for d in me["departments"]] == ["Health"]
    assert client_for("ravi").get(
        "/access/check?module=actions&level=write&place=/india/madhya-pradesh/bhopal"
    ).json() == {"allowed": True, "code": None}
    # Never oneself.
    assert client_for("priya").put(
        f"/workspaces/{india['id']}/members/priya", json=change
    ).json() == {"error": "MEMBER_SELF_EDIT"}


def test_disabling_a_member_ends_their_access_and_sessions_and_enabling_restores_it(
    india,
) -> None:
    _join(india, "ravi", "viewer", "geo-in-mp-bhopal")
    root = client_for("root")
    disabled = root.post(f"/workspaces/{india['id']}/members/ravi/disable")
    assert disabled.json()["status"] == "disabled"
    assert _me("ravi")["workspaces"] == []
    assert india["signed_out"] == ["ravi"]
    assert (
        client_for("ravi")
        .get("/access/check?module=risk&level=read&place=/india/madhya-pradesh/bhopal")
        .json()["allowed"]
        is False
    )
    assert (
        root.post(f"/workspaces/{india['id']}/members/ravi/enable").json()["status"]
        == "active"
    )
    assert len(_me("ravi")["workspaces"]) == 1
    with india["factory"]() as session:
        assert {
            row for row in session.scalars(select(AuditEventRecord.event_type))
        } >= {"membership_disabled", "membership_enabled"}


def test_revoked_and_expired_invitations_grant_nothing_until_resent(india) -> None:
    root = client_for("root")
    revoked = _invite(
        "root", india["id"], "ravi@example.org", [(india["roles"]["viewer"], "geo-in")]
    ).json()
    assert (
        root.post(
            f"/workspaces/{india['id']}/invitations/{revoked['id']}/revoke"
        ).json()["status"]
        == "revoked"
    )
    assert _me("ravi")["workspaces"] == []
    assert root.post(
        f"/workspaces/{india['id']}/invitations/{revoked['id']}/revoke"
    ).json() == {"error": "INVITATION_NOT_PENDING"}

    late = _invite(
        "root", india["id"], "kofi@example.org", [(india["roles"]["viewer"], "geo-in")]
    ).json()
    with india["factory"]() as session:
        session.get(Invitation, late["id"]).expires_at = datetime.now(UTC) - timedelta(
            minutes=1
        )
        session.commit()
    assert _me("kofi")["workspaces"] == []
    statuses = {
        item["id"]: item["status"]
        for item in root.get(f"/workspaces/{india['id']}/invitations").json()["items"]
    }
    assert statuses[late["id"]] == "expired"
    resent = root.post(f"/workspaces/{india['id']}/invitations/{late['id']}/resend")
    assert resent.json()["status"] == "pending"
    assert resent.json()["email_sent"] is True
    # The account a resend makes (or remakes) carries the name the inviter
    # typed, not the email address.
    assert india["accounts"][-1] == ("Kofi", "kofi@example.org")
    assert len(_me("kofi")["workspaces"]) == 1


def test_members_see_people_whose_places_overlap_theirs_only(india) -> None:
    _join(india, "priya", "planning_lead", "geo-in-mp")
    _join(india, "ravi", "viewer", "geo-in-mp-bhopal")
    _join(india, "kofi", "viewer", "geo-in-gj")
    path = f"/workspaces/{india['id']}/members"
    seen = {m["user_id"] for m in client_for("ravi").get(path).json()["items"]}
    # Ravi in Bhopal sees his state lead, not Gujarat.
    assert seen == {"priya", "ravi"}
    lead = {m["user_id"]: m for m in client_for("priya").get(path).json()["items"]}
    assert set(lead) == {"priya", "ravi"}
    assert lead["ravi"]["can_manage"] is False
    everyone = {m["user_id"] for m in client_for("root").get(path).json()["items"]}
    assert everyone == {"priya", "ravi", "kofi"}


def test_departments_are_rows_members_add_rename_archive_and_delete(india) -> None:
    _join(india, "priya", "planning_lead", "geo-in-mp")
    _join(india, "ravi", "viewer", "geo-in-mp-bhopal", ["Water"])
    path = f"/workspaces/{india['id']}/departments"
    listed = client_for("ravi").get(path).json()
    assert sorted(item["name"] for item in listed["items"]) == sorted(
        india["departments"]
    )
    assert listed["mine"] == [india["departments"]["Water"]]
    # A viewer reads; a planning lead adds; only a Workspace admin manages.
    assert client_for("ravi").post(path, json={"name": "Hydrology"}).json() == {
        "error": "CAPABILITY_NOT_ALLOWED"
    }
    added = client_for("priya").post(path, json={"name": "  Hydrology "})
    assert added.status_code == 201
    hydrology = next(i["id"] for i in added.json()["items"] if i["name"] == "Hydrology")
    assert client_for("priya").post(path, json={"name": "hydrology"}).json() == {
        "error": "DEPARTMENT_EXISTS"
    }
    assert client_for("priya").patch(
        f"{path}/{hydrology}", json={"name": "Water resources"}
    ).json() == {"error": "CAPABILITY_NOT_ALLOWED"}
    renamed = client_for("root").patch(
        f"{path}/{hydrology}", json={"name": "Hydrology unit"}
    )
    assert any(i["name"] == "Hydrology unit" for i in renamed.json()["items"])
    # In use: archive, not delete. Unused: delete.
    water = india["departments"]["Water"]
    assert client_for("root").delete(f"{path}/{water}").json() == {
        "error": "DEPARTMENT_IN_USE"
    }
    archived = client_for("root").patch(f"{path}/{water}", json={"archived": True})
    water_row = next(i for i in archived.json()["items"] if i["id"] == water)
    assert water_row["archived"] is True
    assert _me("ravi")["workspaces"][0]["departments"] == []
    assert client_for("ravi").put(
        f"{path}/mine", json={"department_ids": [water]}
    ).json() == {"error": "DEPARTMENT_UNKNOWN"}
    assert client_for("root").delete(f"{path}/{hydrology}").status_code == 200
    # Departments narrow writes, so joining one takes people:write: a viewer
    # cannot add themselves, a planning lead can, and anyone may leave.
    health = india["departments"]["Health"]
    assert client_for("ravi").put(
        f"{path}/mine", json={"department_ids": [health]}
    ).json() == {"error": "DEPARTMENT_JOIN_NOT_ALLOWED"}
    assert _me("ravi")["workspaces"][0]["departments"] == []
    mine = client_for("priya").put(f"{path}/mine", json={"department_ids": [health]})
    assert mine.json()["mine"] == [health]
    assert [d["name"] for d in _me("priya")["workspaces"][0]["departments"]] == [
        "Health"
    ]
    left = client_for("priya").put(f"{path}/mine", json={"department_ids": []})
    assert left.json()["mine"] == []


def test_department_ownership_narrows_writes_to_its_members(india) -> None:
    _join(india, "ravi", "data_officer", "geo-in-mp", ["Water"])
    _join(india, "kofi", "data_officer", "geo-in-mp", ["Health"])
    water = india["departments"]["Water"]
    ownership = {"resources": [{"kind": "data_source", "key": "era5"}]}
    path = f"/workspaces/{india['id']}/departments/{water}/ownership"
    assert client_for("ravi").put(path, json=ownership).json() == {
        "error": "CAPABILITY_NOT_ALLOWED"
    }
    owned = client_for("root").put(path, json=ownership)
    water_row = next(i for i in owned.json()["items"] if i["id"] == water)
    assert water_row["owns"] == [{"kind": "data_source", "key": "era5"}]
    options = client_for("root").get(f"/workspaces/{india['id']}/resources").json()
    assert {
        "kind": "data_source",
        "key": "era5",
        "name": "ERA5 climate (Copernicus)",
    } in (options["items"])
    check = "/access/check?module=data&level=write&place=/india/madhya-pradesh"
    assert client_for("ravi").get(f"{check}&department={water}").json()["allowed"]
    assert client_for("kofi").get(f"{check}&department={water}").json() == {
        "allowed": False,
        "code": "CAPABILITY_NOT_ALLOWED",
    }


def test_a_departments_ownership_narrows_writes_in_its_own_country_only(
    india,
) -> None:
    """Kenya's Health owning ERA5 does not stop India's data officers pulling
    India's ERA5."""
    _join(india, "ravi", "data_officer", "geo-in")
    kenya = client_for("root").post("/workspaces", json={"country_code": "KE"}).json()
    kenya_health = next(
        item["id"]
        for item in client_for("root")
        .get(f"/workspaces/{kenya['id']}/departments")
        .json()["items"]
        if item["name"] == "Health"
    )
    owned = client_for("root").put(
        f"/workspaces/{kenya['id']}/departments/{kenya_health}/ownership",
        json={"resources": [{"kind": "data_source", "key": "era5"}]},
    )
    assert owned.status_code == 200, owned.text
    pull = client_for("ravi").post(
        "/climate/ingestion-jobs", json={"country_code": "IN"}
    )
    assert pull.status_code == 202, pull.text
    # In India, an India department's ownership still narrows the write.
    india_health = india["departments"]["Health"]
    client_for("root").put(
        f"/workspaces/{india['id']}/departments/{india_health}/ownership",
        json={"resources": [{"kind": "data_source", "key": "era5"}]},
    )
    access.forget()
    assert client_for("ravi").post(
        "/climate/ingestion-jobs", json={"country_code": "IN"}
    ).json() == {"error": "CAPABILITY_NOT_ALLOWED"}


def test_concurrent_first_requests_from_an_invited_person_all_succeed(
    india, monkeypatch
) -> None:
    """The web app's first page sends several requests at once; each links the
    new person, and none may fail on the rows another request inserted."""
    invited = _invite(
        "root", india["id"], "ravi@example.org", [(india["roles"]["viewer"], "geo-in")]
    )
    assert invited.status_code == 201
    # Hold both requests after their lookups, so both insert the same person.
    barrier = threading.Barrier(2, timeout=10)
    pending = signin_module._pending

    def in_step(session, email, now):
        found = pending(session, email, now)
        barrier.wait()
        return found

    monkeypatch.setattr(signin_module, "_pending", in_step)
    results: list[object] = []

    def first_request() -> None:
        try:
            results.append(client_for("ravi").get("/auth/me").status_code)
        except Exception as error:  # noqa: BLE001 - the regression is a raise
            results.append(error)

    threads = [threading.Thread(target=first_request) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert results == [200, 200]
    monkeypatch.setattr(signin_module, "_pending", pending)
    access.forget()
    [workspace] = _me("ravi")["workspaces"]
    assert [g["roleName"] for g in workspace["grants"]] == ["Viewer"]


def test_another_countrys_members_cannot_reach_this_workspace(india) -> None:
    kenya = client_for("root").post("/workspaces", json={"country_code": "KE"}).json()
    roles = {
        r["key"]: r["id"]
        for r in client_for("root")
        .get(f"/workspaces/{kenya['id']}/roles")
        .json()["items"]
    }
    _invite(
        "root", kenya["id"], "kofi@example.org", [(roles["workspace_admin"], "geo-ke")]
    )
    _me("kofi")
    for path in ("members", "departments", "invitations", "roles"):
        assert client_for("kofi").get(f"/workspaces/{india['id']}/{path}").json() == {
            "error": "WORKSPACE_NOT_FOUND"
        }
    assert [
        w["country_code"] for w in client_for("kofi").get("/workspaces").json()["items"]
    ] == ["KE"]
    # A Kenya role cannot be granted in India.
    assert _invite(
        "root", india["id"], "ravi@example.org", [(roles["viewer"], "geo-in")]
    ).json() == {"error": "GRANT_ROLE_INVALID"}


def test_the_seeded_admin_becomes_platform_admin_only_while_there_is_none(
    world,
) -> None:
    # root is already a platform admin: the seeded account gains nothing.
    assert _me("seeded-admin")["isPlatformAdmin"] is False
    with world["factory"]() as session:
        assert session.get(AppUser, "seeded-admin") is None
        session.get(AppUser, "root").is_platform_admin = False
        session.commit()
    access.forget()
    me = _me("seeded-admin")
    assert me["isPlatformAdmin"] is True
    with world["factory"]() as session:
        assert session.get(AppUser, "seeded-admin").last_seen_at is not None
