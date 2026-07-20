from __future__ import annotations

from datetime import date
from typing import Iterator
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from chart.api.app import app
from chart.auth.schemas import CurrentUserContext
from chart.auth.service import require_current_user
from chart.climate.schemas import (
    Availability,
    MonthValue,
    PredictResponse,
    PredictionAcceptedResponse,
    PredictionRequestStatusResponse,
    PreviewResponse,
)
from chart.climate.service import ClimateServiceError


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def authenticated_client() -> Iterator[TestClient]:
    app.dependency_overrides[require_current_user] = lambda: CurrentUserContext(
        user_id="test-user",
        username="test-user",
        roles=["health_planning_lead"],
        geography_scopes=["/india/madhya-pradesh"],
    )
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(require_current_user, None)


def _override_user(*, roles: list[str], geography_scopes: list[str]) -> None:
    app.dependency_overrides[require_current_user] = lambda: CurrentUserContext(
        user_id="test-user",
        username="test-user",
        roles=roles,
        geography_scopes=geography_scopes,
    )


def _queued_status() -> PredictionRequestStatusResponse:
    return PredictionRequestStatusResponse(
        request_id=12,
        status="queued",
        stage="queued",
        location_slug="madhya-pradesh",
        timeframe_id="exposure_3m",
        created_at="2026-07-20T10:00:00+00:00",
        updated_at="2026-07-20T10:00:00+00:00",
    )


def test_list_locations(client: TestClient) -> None:
    response = client.get("/climate/locations")
    assert response.status_code == 200
    slugs = [item["slug"] for item in response.json()["items"]]
    assert slugs == ["madhya-pradesh", "kajiado"]


def test_list_timeframes(client: TestClient) -> None:
    response = client.get("/climate/timeframes")
    assert response.status_code == 200
    ids = [item["id"] for item in response.json()["items"]]
    assert "exposure_3m" in ids
    assert "seasonal" in ids


def test_preview_seasonal_is_not_available(client: TestClient) -> None:
    response = client.post(
        "/climate/preview",
        json={"location_slug": "madhya-pradesh", "timeframe_id": "seasonal"},
    )
    assert response.status_code == 200
    assert response.json()["availability"]["status"] == "not_available"
    assert response.json()["availability"]["pull_required"] is False


def test_predict_without_outcome(authenticated_client: TestClient) -> None:
    preview_body = PreviewResponse(
        location={
            "slug": "madhya-pradesh",
            "name": "Madhya Pradesh",
            "country": "India",
            "level": "state",
            "supports_lbw_prediction": True,
            "lbw_areas": ["Madhya Pradesh"],
        },
        timeframe={
            "id": "exposure_3m",
            "label": "Exposure window (3 months)",
            "description": "x",
            "horizon": "short",
            "resolution": "monthly",
            "month_count": 3,
            "tier": "observed",
        },
        availability=Availability(
            location_slug="madhya-pradesh",
            timeframe_id="exposure_3m",
            status="ready",
            months_requested=3,
            months_found=3,
            missing_months=[],
            period_start="2024-10",
            period_end="2024-12",
            last_refreshed_at="2026-07-15T10:00:00Z",
            climate_run_id=1,
            data_label="sample",
            pull_required=False,
            pull_hint=None,
        ),
        series=[
            MonthValue(month="2024-10", tmax_monthly_mean_c=31.2),
            MonthValue(month="2024-11", tmax_monthly_mean_c=30.4),
            MonthValue(month="2024-12", tmax_monthly_mean_c=29.1),
        ],
    )

    with patch("chart.api.app.submit_prediction") as predict_mock:
        predict_mock.return_value = PredictResponse(
            **preview_body.model_dump(),
            prediction=None,
            prediction_note="No outcome requested.",
        )
        response = authenticated_client.post(
            "/climate/predict",
            json={"location_slug": "madhya-pradesh", "timeframe_id": "exposure_3m"},
        )

    assert response.status_code == 200
    assert response.json()["prediction"] is None


def test_predict_maps_service_error(authenticated_client: TestClient) -> None:
    with patch(
        "chart.api.app.submit_prediction",
        side_effect=ClimateServiceError("CLIMATE_DATA_NOT_READY", 409),
    ):
        response = authenticated_client.post(
            "/climate/predict",
            json={
                "location_slug": "madhya-pradesh",
                "timeframe_id": "exposure_3m",
                "outcome": {"type": "lbw", "trimester": 1},
            },
        )

    assert response.status_code == 409
    assert response.json() == {"error": "CLIMATE_DATA_NOT_READY"}


def test_predict_returns_accepted_when_climate_pull_is_queued(
    authenticated_client: TestClient,
) -> None:
    with patch(
        "chart.api.app.submit_prediction",
        return_value=PredictionAcceptedResponse(
            request_id=12,
            status="queued",
            stage="queued",
            location_slug="madhya-pradesh",
            timeframe_id="exposure_3m",
            status_url="/climate/prediction-requests/12",
            message="Prediction is queued for background processing.",
        ),
    ):
        response = authenticated_client.post(
            "/climate/predict",
            json={
                "location_slug": "madhya-pradesh",
                "timeframe_id": "exposure_3m",
                "outcome": {"type": "lbw", "trimester": 1},
            },
        )

    assert response.status_code == 202
    assert response.headers["Retry-After"] == "3"
    assert response.json()["request_id"] == 12
    assert response.json()["stage"] == "queued"
    assert response.json()["status_url"] == "/climate/prediction-requests/12"


def test_prediction_routes_require_keycloak_token(client: TestClient) -> None:
    predict_response = client.post(
        "/climate/predict",
        json={"location_slug": "madhya-pradesh", "timeframe_id": "exposure_3m"},
    )
    status_response = client.get("/climate/prediction-requests/12")

    assert predict_response.status_code == 401
    assert predict_response.json() == {"error": "AUTH_TOKEN_REQUIRED"}
    assert predict_response.headers["WWW-Authenticate"] == "Bearer"
    assert status_response.status_code == 401


def test_predict_rejects_out_of_scope_geography(client: TestClient) -> None:
    _override_user(
        roles=["health_planning_lead"],
        geography_scopes=["/kenya/kajiado"],
    )
    try:
        with patch("chart.api.app.submit_prediction") as submit_mock:
            response = client.post(
                "/climate/predict",
                json={
                    "location_slug": "madhya-pradesh",
                    "timeframe_id": "exposure_3m",
                    "outcome": {"type": "lbw", "trimester": 1},
                },
            )
    finally:
        app.dependency_overrides.pop(require_current_user, None)

    assert response.status_code == 403
    assert response.json() == {"error": "GEOGRAPHY_OUT_OF_SCOPE"}
    submit_mock.assert_not_called()


def test_predict_rejects_role_without_prediction_access(client: TestClient) -> None:
    _override_user(
        roles=["public_viewer"],
        geography_scopes=["/india/madhya-pradesh"],
    )
    try:
        with patch("chart.api.app.submit_prediction") as submit_mock:
            response = client.post(
                "/climate/predict",
                json={
                    "location_slug": "madhya-pradesh",
                    "timeframe_id": "exposure_3m",
                    "outcome": {"type": "lbw", "trimester": 1},
                },
            )
    finally:
        app.dependency_overrides.pop(require_current_user, None)

    assert response.status_code == 403
    assert response.json() == {"error": "ROLE_NOT_ALLOWED"}
    submit_mock.assert_not_called()


def test_prediction_status_rejects_out_of_scope_geography(
    client: TestClient,
) -> None:
    _override_user(
        roles=["health_planning_lead"],
        geography_scopes=["/kenya/kajiado"],
    )
    try:
        with patch(
            "chart.api.app.get_prediction_request", return_value=_queued_status()
        ):
            response = client.get("/climate/prediction-requests/12")
    finally:
        app.dependency_overrides.pop(require_current_user, None)

    assert response.status_code == 403
    assert response.json() == {"error": "GEOGRAPHY_OUT_OF_SCOPE"}


def test_prediction_status_allows_matching_geography(
    authenticated_client: TestClient,
) -> None:
    with patch("chart.api.app.get_prediction_request", return_value=_queued_status()):
        response = authenticated_client.get("/climate/prediction-requests/12")

    assert response.status_code == 200
    assert response.json()["request_id"] == 12


def test_format_month_helper() -> None:
    from chart.climate.service import _format_month

    assert _format_month(date(2024, 12, 1)) == "2024-12"
