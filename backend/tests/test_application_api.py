from __future__ import annotations

from collections.abc import Iterator
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from chart.api.app import app
from chart.auth.schemas import CurrentUserContext
from chart.auth.service import require_current_user
from chart.setup.schemas import (
    BootstrapAdminResponse,
    BootstrapSetupResponse,
    SetupCounts,
    SetupStatus,
)
from chart.setup.service import SetupError


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def planning_user_client() -> Iterator[TestClient]:
    app.dependency_overrides[require_current_user] = lambda: CurrentUserContext(
        user_id="planner-1",
        username="planner",
        roles=["health_planning_lead"],
        geography_scopes=["/india/madhya-pradesh"],
    )
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(require_current_user, None)


@pytest.fixture
def admin_client() -> Iterator[TestClient]:
    app.dependency_overrides[require_current_user] = lambda: CurrentUserContext(
        user_id="admin-1",
        username="admin",
        roles=["chart_admin", "content_editor"],
        geography_scopes=["/india/madhya-pradesh"],
    )
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(require_current_user, None)


def test_setup_status_remains_public(client: TestClient) -> None:
    status = SetupStatus(
        completed=False,
        requiresOnboarding=True,
        collaboratingSectorIds=[],
        counts=SetupCounts(geographies=0, workspaceMembers=0),
    )
    with patch("chart.setup.routes.get_status", return_value=status):
        response = client.get("/setup")
    assert response.status_code == 200
    assert response.json()["requiresOnboarding"] is True


def test_setup_options_return_installation_sectors(client: TestClient) -> None:
    response = client.get("/setup/options")

    assert response.status_code == 200
    assert response.json()["sectors"][:2] == [
        {"id": "health", "label": "Health"},
        {"id": "environment", "label": "Environment & climate change"},
    ]


def test_readiness_rejects_a_database_behind_the_code(
    client: TestClient, monkeypatch
) -> None:
    monkeypatch.delenv("INFERENCE_LBW_BASE_URL", raising=False)

    class FakeSession:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def execute(self, _statement):
            return None

        def scalar(self, statement):
            if "alembic_version" in str(statement):
                return "012_status_server_defaults"
            return None

    with patch(
        "chart.api.app.get_session_factory",
        return_value=lambda: FakeSession(),
    ):
        response = client.get("/ready")

    assert response.status_code == 503
    assert response.json() == {"error": "SERVICE_NOT_READY"}


def test_setup_bootstrap_requires_deployment_secret(
    client: TestClient, monkeypatch
) -> None:
    monkeypatch.delenv("CHART_BOOTSTRAP_TOKEN", raising=False)
    response = client.post("/setup/bootstrap", json=_bootstrap_request())

    assert response.status_code == 503
    assert response.json() == {"error": "SETUP_BOOTSTRAP_DISABLED"}


def test_setup_bootstrap_accepts_deployment_secret(
    client: TestClient, monkeypatch
) -> None:
    monkeypatch.setenv("CHART_BOOTSTRAP_TOKEN", "bootstrap-test-secret")
    status = SetupStatus(
        completed=True,
        requiresOnboarding=False,
        countryCode="IN",
        countryName="India",
        rootGeographyId="geo-in",
        firstAdminUserId="admin-1",
        primarySectorId="water",
        collaboratingSectorIds=["agriculture"],
        counts=SetupCounts(geographies=2, workspaceMembers=1),
    )
    result = BootstrapSetupResponse(
        setup=status,
        admin=BootstrapAdminResponse(
            userId="admin-1",
            username="chart-admin",
            email="chart-admin@example.org",
        ),
    )
    with patch("chart.setup.routes.bootstrap", return_value=result):
        response = client.post(
            "/setup/bootstrap",
            json=_bootstrap_request(),
            headers={"X-CHART-Bootstrap-Token": "bootstrap-test-secret"},
        )

    assert response.status_code == 200
    assert response.json()["setup"]["completed"] is True


def test_setup_bootstrap_maps_identity_group_failure(
    client: TestClient, monkeypatch
) -> None:
    monkeypatch.setenv("CHART_BOOTSTRAP_TOKEN", "bootstrap-test-secret")
    with patch(
        "chart.setup.routes.bootstrap",
        side_effect=SetupError("SETUP_IDENTITY_GROUP_FAILED", 502),
    ):
        response = client.post(
            "/setup/bootstrap",
            json=_bootstrap_request(),
            headers={"X-CHART-Bootstrap-Token": "bootstrap-test-secret"},
        )

    assert response.status_code == 502
    assert response.json() == {"error": "SETUP_IDENTITY_GROUP_FAILED"}


def test_setup_complete_requires_keycloak(client: TestClient) -> None:
    response = client.post(
        "/setup/complete",
        json={
            "countryCode": "IN",
            "countryName": "India",
            "geographyLevelLabel": "State",
            "primarySectorId": "water",
            "collaboratingSectorIds": ["agriculture"],
        },
    )
    assert response.status_code == 401
    assert response.json() == {"error": "AUTH_TOKEN_REQUIRED"}


def test_setup_complete_denies_non_admin(planning_user_client: TestClient) -> None:
    response = planning_user_client.post(
        "/setup/complete",
        json={
            "countryCode": "IN",
            "countryName": "India",
            "geographyLevelLabel": "State",
            "primarySectorId": "water",
            "collaboratingSectorIds": ["agriculture"],
        },
    )
    assert response.status_code == 403
    assert response.json() == {"error": "SETUP_FORBIDDEN"}


def test_setup_complete_rejects_unknown_sector(admin_client: TestClient) -> None:
    response = admin_client.post(
        "/setup/complete",
        json={
            "countryCode": "IN",
            "countryName": "India",
            "geographyLevelLabel": "State",
            "primarySectorId": "unknown",
            "collaboratingSectorIds": [],
        },
    )

    assert response.status_code == 400
    assert response.json() == {"error": "SETUP_SECTOR_INVALID"}


def test_users_require_keycloak(client: TestClient) -> None:
    response = client.get("/users")
    assert response.status_code == 401
    assert response.json() == {"error": "AUTH_TOKEN_REQUIRED"}


def test_users_deny_non_admin(planning_user_client: TestClient) -> None:
    response = planning_user_client.get("/users")
    assert response.status_code == 403
    assert response.json() == {"error": "USER_FORBIDDEN"}


def _bootstrap_request() -> dict:
    return {
        "countryCode": "IN",
        "countryName": "India",
        "geographyLevelLabel": "State",
        "primarySectorId": "water",
        "collaboratingSectorIds": ["agriculture"],
        "geographies": [
            {
                "id": "geo-in-madhya-pradesh",
                "level": "geo_level_1",
                "levelLabel": "State",
                "name": "Madhya Pradesh",
                "path": "/india/madhya-pradesh",
            }
        ],
        "admin": {
            "name": "CHART administrator",
            "email": "chart-admin@example.org",
            "username": "chart-admin",
            "password": "valid-password",
        },
    }
