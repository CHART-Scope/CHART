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
    monkeypatch.setattr(service, "_get_signing_key", lambda _url, _token: public_key)

    def sign(**overrides):
        claims = {
            "sub": "verified-user",
            "preferred_username": "verified-health-lead",
            "email": "lead@example.org",
            "iss": issuer,
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


def test_auth_me_rejects_invalid_issuer(client: TestClient, signed_token) -> None:
    response = client.get(
        "/auth/me",
        headers={
            "Authorization": f"Bearer {signed_token(iss='http://wrong.test/realms/chart')}"
        },
    )

    assert response.status_code == 401
    assert response.json() == {"error": "AUTH_TOKEN_INVALID"}


def test_geography_access_matches_fastify_contract(
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


def test_openapi_marks_auth_and_prediction_routes_as_bearer_protected(
    client: TestClient,
) -> None:
    document = client.get("/openapi.json").json()

    assert document["paths"]["/auth/me"]["get"]["security"] == [{"bearerAuth": []}]
    assert "401" in document["paths"]["/auth/me"]["get"]["responses"]
    assert document["paths"]["/climate/predict"]["post"]["security"] == [
        {"bearerAuth": []}
    ]
