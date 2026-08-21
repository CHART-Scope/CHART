from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from chart.api.app import app
from chart.auth import service


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def signed_token(monkeypatch: pytest.MonkeyPatch):
    issuer = "http://keycloak.test/realms/chart"
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_key = private_key.public_key()
    now = datetime.now(timezone.utc)

    monkeypatch.setenv("KEYCLOAK_ISSUER_URL", issuer)
    monkeypatch.setenv("KEYCLOAK_CLIENT_ID", "chart-api")
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
            "aud": "chart-api",
            "exp": now + timedelta(minutes=5),
            "groups": ["/country-b/region-b"],
            "resource_access": {"chart-api": {"roles": ["health_planning_lead"]}},
        }
        claims.update(overrides)
        return jwt.encode(
            claims,
            private_key,
            algorithm="RS256",
            headers={"kid": "chart-test-key"},
        )

    return sign


def test_auth_me_maps_keycloak_roles_and_geography(
    client: TestClient, signed_token
) -> None:
    response = client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {signed_token()}"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "userId": "verified-user",
        "username": "verified-health-lead",
        "email": "lead@example.org",
        "roles": ["health_planning_lead"],
        "geographyScopes": ["/country-b/region-b"],
        "activeGeographyId": "/country-b/region-b",
        "geographyLevel": "geo_level_1",
    }


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
    assert response.json()["geographyLevel"] == "geo_level_2"


def test_admin_can_switch_within_assigned_country_but_not_to_another_country(
    client: TestClient, signed_token
) -> None:
    token = signed_token(resource_access={"chart-api": {"roles": ["chart_admin"]}})
    headers = {"Authorization": f"Bearer {token}"}

    profile = client.get("/auth/me", headers=headers)
    sibling = client.get(
        "/auth/geography-access?geography=/country-b/region-c", headers=headers
    )
    other_country = client.get(
        "/auth/geography-access?geography=/country-a/region-a", headers=headers
    )

    assert profile.status_code == 200
    assert profile.json()["geographyScopes"] == ["/country-b"]
    assert profile.json()["activeGeographyId"] == "/country-b/region-b"
    assert sibling.status_code == 200
    assert other_country.status_code == 403


def test_auth_me_unions_model_family_roots_into_admin_scopes_when_opted_in(
    client: TestClient, signed_token, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("CHART_ADMIN_SEES_ALL_MODEL_GEOGRAPHIES", "true")
    monkeypatch.setattr(service, "_active_model_family_roots", lambda: ["/kenya"])
    token = signed_token(resource_access={"chart-api": {"roles": ["chart_admin"]}})

    response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json()["geographyScopes"] == ["/country-b", "/kenya"]


def test_auth_me_does_not_union_model_roots_for_non_admin(
    client: TestClient, signed_token, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("CHART_ADMIN_SEES_ALL_MODEL_GEOGRAPHIES", "true")
    monkeypatch.setattr(service, "_active_model_family_roots", lambda: ["/kenya"])

    response = client.get(
        "/auth/me", headers={"Authorization": f"Bearer {signed_token()}"}
    )

    assert response.status_code == 200
    assert response.json()["geographyScopes"] == ["/country-b/region-b"]


def test_admin_union_is_off_by_default(
    client: TestClient, signed_token, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("CHART_ADMIN_SEES_ALL_MODEL_GEOGRAPHIES", raising=False)
    monkeypatch.setattr(service, "_active_model_family_roots", lambda: ["/kenya"])
    token = signed_token(resource_access={"chart-api": {"roles": ["chart_admin"]}})

    response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    # Default is opt-in — no union, admin stays on their Keycloak country.
    assert response.json()["geographyScopes"] == ["/country-b"]


def test_admin_union_requires_exact_true(
    client: TestClient, signed_token, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Only the literal string "true" enables the union — "1", "yes", "True"
    # are all treated as false so a typo can't silently open scope up.
    monkeypatch.setenv("CHART_ADMIN_SEES_ALL_MODEL_GEOGRAPHIES", "yes")
    monkeypatch.setattr(service, "_active_model_family_roots", lambda: ["/kenya"])
    token = signed_token(resource_access={"chart-api": {"roles": ["chart_admin"]}})

    response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json()["geographyScopes"] == ["/country-b"]


def test_auth_me_snaps_back_when_active_geography_falls_out_of_scope(
    client: TestClient, signed_token
) -> None:
    # sessionStorage remembered /out-of-scope from before the admin flag was
    # flipped off. The stale header should be silently dropped, not 403 — the
    # user lands on their default Keycloak-derived area instead of being
    # locked out.
    response = client.get(
        "/auth/me?activeGeography=/country-a/region-a",
        headers={"Authorization": f"Bearer {signed_token()}"},
    )

    assert response.status_code == 200
    assert response.json()["activeGeographyId"] == "/country-b/region-b"


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


def test_geography_access_allows_descendants_but_not_unrelated_places(
    client: TestClient, signed_token
) -> None:
    headers = {"Authorization": f"Bearer {signed_token()}"}
    allowed = client.get(
        "/auth/geography-access?geography=/country-b/region-b/district-c",
        headers=headers,
    )
    denied = client.get(
        "/auth/geography-access?geography=/country-a/region-a",
        headers=headers,
    )

    assert allowed.status_code == 200
    assert allowed.json() == {
        "canAccess": True,
        "geographyPath": "/country-b/region-b/district-c",
        "userId": "verified-user",
    }
    assert denied.status_code == 403
    assert denied.json() == {"error": "GEOGRAPHY_OUT_OF_SCOPE"}


def test_geography_access_does_not_leak_parent_aggregates(
    client: TestClient, signed_token
) -> None:
    token = signed_token(groups=["/country-b/region-b/district-c"])

    response = client.get(
        "/auth/geography-access?geography=/country-b/region-b",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 403
    assert response.json() == {"error": "GEOGRAPHY_OUT_OF_SCOPE"}


def test_openapi_marks_auth_and_prediction_routes_as_bearer_protected(
    client: TestClient,
) -> None:
    document = client.get("/openapi.json").json()

    assert document["paths"]["/auth/me"]["get"]["security"] == [{"bearerAuth": []}]
    assert "401" in document["paths"]["/auth/me"]["get"]["responses"]
    assert document["paths"]["/climate/predict"]["post"]["security"] == [
        {"bearerAuth": []}
    ]
