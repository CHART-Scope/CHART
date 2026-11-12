from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from chart.access import principal as access
from chart.api.app import app
from chart.auth import service
from chart.shared.db import session as db_session
from chart.shared.db.base import Base
from chart.shared.db.models import (
    AccessRole,
    AppGeography,
    AppUser,
    CountryGeoConfig,
    Membership,
    MembershipGrant,
)
from chart.access.workspaces import ensure_workspace


@pytest.fixture
def client(tmp_path, monkeypatch) -> TestClient:
    """The API over a database where verified-user is a Planning lead in
    region-b (country-b). The token's own roles and groups count for
    nothing; only the database grants access."""

    url = f"sqlite:///{tmp_path / 'auth.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    Base.metadata.create_all(db_session.get_engine(url))
    access.forget()
    with db_session.get_session_factory()() as session:
        for code, country in (("B", "country-b"), ("A", "country-a")):
            for level in ("country", "region", "district"):
                session.add(
                    CountryGeoConfig(
                        country_code=code, level_key=level, level_label=level
                    )
                )
            session.flush()
            session.add(
                AppGeography(
                    id=country,
                    country_code=code,
                    level="country",
                    level_label="Country",
                    name=country,
                    path=f"/{country}",
                )
            )
            session.flush()
        for id_, parent, path in (
            ("region-b", "country-b", "/country-b/region-b"),
            ("region-c", "country-b", "/country-b/region-c"),
            ("region-a", "country-a", "/country-a/region-a"),
            ("district-c", "region-b", "/country-b/region-b/district-c"),
        ):
            session.add(
                AppGeography(
                    id=id_,
                    country_code=path.split("/")[1][-1].upper(),
                    level="district" if "district" in id_ else "region",
                    level_label="Area",
                    name=id_,
                    parent_id=parent,
                    path=path,
                )
            )
            session.flush()
        workspace = ensure_workspace(session, "B")
        session.add_all(
            [
                AppUser(
                    id="verified-user",
                    username="verified-health-lead",
                    email="lead@example.org",
                    display_name="Lead",
                    status="active",
                ),
                AppUser(
                    id="root",
                    username="root",
                    email="root@example.org",
                    display_name="Root",
                    status="active",
                    is_platform_admin=True,
                ),
            ]
        )
        session.flush()
        membership = Membership(
            user_id="verified-user", workspace_id=workspace.id, status="active"
        )
        session.add(membership)
        session.flush()
        lead = session.query(AccessRole).filter_by(key="planning_lead").one()
        session.add(
            MembershipGrant(
                membership_id=membership.id, role_id=lead.id, geography_id="region-b"
            )
        )
        session.commit()
    yield TestClient(app)
    access.forget()


@pytest.fixture
def signed_token(monkeypatch: pytest.MonkeyPatch):
    issuer = "http://keycloak.test/realms/chart"
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_key = private_key.public_key()
    now = datetime.now(timezone.utc)

    monkeypatch.setenv("KEYCLOAK_ISSUER_URL", issuer)
    monkeypatch.setenv("KEYCLOAK_CLIENT_ID", "chart-core")
    monkeypatch.setenv("KEYCLOAK_JWKS_URL", "http://keycloak.test/certs")
    monkeypatch.setattr(
        service,
        "_get_signing_key",
        lambda _url, _timeout_seconds, _token: public_key,
    )

    def sign(**overrides):
        claims = {
            "sub": "verified-user",
            "preferred_username": "verified-health-lead",
            "email": "lead@example.org",
            "iss": issuer,
            "aud": "chart-core",
            "exp": now + timedelta(minutes=5),
            "groups": ["/country-b/region-b"],
            "resource_access": {"chart-core": {"roles": ["health_planning_lead"]}},
        }
        claims.update(overrides)
        return jwt.encode(
            claims,
            private_key,
            algorithm="RS256",
            headers={"kid": "chart-test-key"},
        )

    return sign


def test_auth_me_reads_access_from_the_database_not_the_token(
    client: TestClient, signed_token
) -> None:
    response = client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {signed_token()}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["userId"] == "verified-user"
    assert body["isPlatformAdmin"] is False
    assert body["geographyScopes"] == ["/country-b/region-b"]
    assert body["activeGeographyId"] == "/country-b/region-b"
    [workspace] = body["workspaces"]
    assert workspace["grants"][0]["roleKey"] == "planning_lead"
    assert workspace["grants"][0]["capabilities"]["risk"] == "write"
    assert "roles" not in body


def test_token_roles_and_groups_grant_nothing(client: TestClient, signed_token) -> None:
    # A token claiming chart_admin and another country's group: the
    # installation already has a platform admin, and groups are ignored.
    token = signed_token(
        groups=["/country-a"],
        resource_access={"chart-core": {"roles": ["chart_admin"]}},
    )
    headers = {"Authorization": f"Bearer {token}"}
    profile = client.get("/auth/me", headers=headers).json()
    other_country = client.get(
        "/auth/geography-access?geography=/country-a/region-a", headers=headers
    )

    assert profile["isPlatformAdmin"] is False
    assert profile["geographyScopes"] == ["/country-b/region-b"]
    assert other_country.status_code == 403


def test_auth_me_requires_a_keycloak_token(client: TestClient) -> None:
    response = client.get("/auth/me")

    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"
    assert response.json() == {"error": "AUTH_TOKEN_REQUIRED"}


def test_auth_me_applies_an_allowed_active_geography(
    client: TestClient, signed_token
) -> None:
    response = client.get(
        "/auth/me?activeGeography=/country-b/region-b/district-c",
        headers={"Authorization": f"Bearer {signed_token()}"},
    )

    assert response.status_code == 200
    assert response.json()["activeGeographyId"] == "/country-b/region-b/district-c"


def test_auth_me_snaps_back_when_active_geography_falls_out_of_scope(
    client: TestClient, signed_token
) -> None:
    # sessionStorage remembered a place from before a grant was removed. The
    # stale header is dropped, not refused, and the person lands on their
    # first place.
    response = client.get(
        "/auth/me?activeGeography=/country-a/region-a",
        headers={"Authorization": f"Bearer {signed_token()}"},
    )

    assert response.status_code == 200
    assert response.json()["activeGeographyId"] == "/country-b/region-b"


def test_a_platform_admin_works_from_every_workspace(
    client: TestClient, signed_token
) -> None:
    token = signed_token(
        sub="root", preferred_username="root", email="root@example.org"
    )
    body = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"}).json()

    assert body["isPlatformAdmin"] is True
    assert body["geographyScopes"][0] == "/country-b"


def test_auth_me_rejects_invalid_issuer(client: TestClient, signed_token) -> None:
    response = client.get(
        "/auth/me",
        headers={
            "Authorization": f"Bearer {signed_token(iss='http://wrong.test/realms/chart')}"
        },
    )

    assert response.status_code == 401
    assert response.json() == {"error": "AUTH_TOKEN_INVALID"}


def test_auth_me_rejects_token_for_another_audience(
    client: TestClient, signed_token
) -> None:
    response = client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {signed_token(aud='another-api')}"},
    )

    assert response.status_code == 401
    assert response.json() == {"error": "AUTH_TOKEN_INVALID"}


def test_geography_access_covers_below_and_above_but_not_beside(
    client: TestClient, signed_token
) -> None:
    headers = {"Authorization": f"Bearer {signed_token()}"}
    below = client.get(
        "/auth/geography-access?geography=/country-b/region-b/district-c",
        headers=headers,
    )
    above = client.get("/auth/geography-access?geography=/country-b", headers=headers)
    beside = client.get(
        "/auth/geography-access?geography=/country-b/region-c", headers=headers
    )
    other = client.get(
        "/auth/geography-access?geography=/country-a/region-a", headers=headers
    )

    assert below.status_code == 200
    assert below.json() == {
        "canAccess": True,
        "geographyPath": "/country-b/region-b/district-c",
        "userId": "verified-user",
    }
    # The country above is readable for context (docs/access-control.md).
    assert above.status_code == 200
    assert beside.status_code == 403
    assert other.status_code == 403
    assert other.json() == {"error": "GEOGRAPHY_OUT_OF_SCOPE"}


def test_openapi_marks_auth_and_prediction_routes_as_bearer_protected(
    client: TestClient,
) -> None:
    document = client.get("/openapi.json").json()

    assert document["paths"]["/auth/me"]["get"]["security"] == [{"bearerAuth": []}]
    assert "401" in document["paths"]["/auth/me"]["get"]["responses"]
    assert document["paths"]["/climate/predict"]["post"]["security"] == [
        {"bearerAuth": []}
    ]
