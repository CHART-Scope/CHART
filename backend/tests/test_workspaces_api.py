from __future__ import annotations

from collections.abc import Iterator
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from chart.api.app import app
from chart.auth.schemas import CurrentUserContext
from chart.auth.service import require_current_user
from chart.workspaces.schemas import WorkspaceResponse
from chart.workspaces.service import WorkspaceError


def _user(*, scopes=None, roles=None) -> CurrentUserContext:
    return CurrentUserContext(
        user_id="user-1",
        username="planner",
        roles=roles or ["health_planning_lead"],
        geography_scopes=scopes or ["/india/madhya-pradesh"],
    )


def _workspace() -> WorkspaceResponse:
    return WorkspaceResponse.model_validate(
        {
            "id": "workspace-1",
            "name": "MP planning",
            "planning_cycle": "2026",
            "status": "active",
            "geography_id": "geo-in-madhya-pradesh",
            "created_by_user_id": "user-1",
            "owner_user_id": "user-1",
            "member_role": "owner",
        }
    )


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def authenticated_client() -> Iterator[TestClient]:
    app.dependency_overrides[require_current_user] = _user
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(require_current_user, None)


def test_workspace_routes_require_keycloak(client: TestClient) -> None:
    response = client.get("/workspaces/workspace-1")
    assert response.status_code == 401
    assert response.json() == {"error": "AUTH_TOKEN_REQUIRED"}


def test_create_workspace_keeps_python_contract(
    authenticated_client: TestClient,
) -> None:
    with patch("chart.workspaces.routes.create_workspace", return_value=_workspace()):
        response = authenticated_client.post(
            "/workspaces",
            json={
                "name": "MP planning",
                "geographyId": "geo-in-madhya-pradesh",
                "planningCycle": "2026",
            },
        )
    assert response.status_code == 201
    assert response.json()["memberRole"] == "owner"


def test_create_workspace_maps_geography_denial(
    authenticated_client: TestClient,
) -> None:
    with patch(
        "chart.workspaces.routes.create_workspace",
        side_effect=WorkspaceError("WORKSPACE_ACCESS_DENIED", 403),
    ):
        response = authenticated_client.post(
            "/workspaces",
            json={"name": "Wrong place", "geographyId": "geo-ke-kajiado"},
        )
    assert response.status_code == 403
    assert response.json() == {"error": "WORKSPACE_ACCESS_DENIED"}


def test_create_workspace_maps_role_denial(authenticated_client: TestClient) -> None:
    with patch(
        "chart.workspaces.routes.create_workspace",
        side_effect=WorkspaceError("WORKSPACE_CREATE_FORBIDDEN", 403),
    ):
        response = authenticated_client.post(
            "/workspaces",
            json={"name": "Viewer", "geographyId": "geo-in-madhya-pradesh"},
        )
    assert response.status_code == 403
    assert response.json() == {"error": "WORKSPACE_CREATE_FORBIDDEN"}
