from __future__ import annotations

from typing import Iterator
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from chart.api.app import app
from chart.auth.schemas import CurrentUserContext
from chart.auth.service import require_current_user
from chart.climate.schemas import (
    HeatSeasonOptionResponse,
    PlaceListResponse,
    PlaceResponse,
    PlanningOptionsResponse,
    PredictionAcceptedResponse,
    PredictionRequestListResponse,
    PredictionRequestStatusResponse,
    PredictionRequestSummaryResponse,
)


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


def _place() -> PlaceResponse:
    return PlaceResponse(
        geography_id="geo-in-madhya-pradesh",
        code="madhya-pradesh",
        name="Madhya Pradesh",
        level="State",
        path="/india/madhya-pradesh",
        supports_prediction=True,
        model_version="1.0.0",
    )


def _accepted() -> PredictionAcceptedResponse:
    return PredictionAcceptedResponse(
        request_id=12,
        status="queued",
        stage="queued",
        geography_id="geo-in-madhya-pradesh",
        planning_date="2026-10-01",
        status_url="/climate/prediction-requests/12",
        message="Prediction is queued.",
    )


def _status() -> PredictionRequestStatusResponse:
    return PredictionRequestStatusResponse(
        request_id=12,
        status="queued",
        stage="queued",
        geography_id="geo-in-madhya-pradesh",
        planning_date="2026-10-01",
        created_at="2026-07-22T10:00:00+00:00",
        updated_at="2026-07-22T10:00:00+00:00",
    )


def _history() -> PredictionRequestListResponse:
    return PredictionRequestListResponse(
        items=[
            PredictionRequestSummaryResponse(
                request_id=12,
                status="queued",
                stage="queued",
                geography_id="geo-in-madhya-pradesh",
                planning_date="2026-10-01",
                source_as_of="2026-07-22",
                created_at="2026-07-22T10:00:00+00:00",
                updated_at="2026-07-22T10:00:00+00:00",
            )
        ]
    )


def test_list_locations_is_database_driven(client: TestClient) -> None:
    with patch(
        "chart.climate.routes.list_locations",
        return_value=PlaceListResponse(items=[_place()]),
    ):
        response = client.get("/climate/locations")
    assert response.status_code == 200
    assert response.json()["items"][0]["geography_id"] == "geo-in-madhya-pradesh"


def test_prediction_routes_require_keycloak(client: TestClient) -> None:
    response = client.post(
        "/climate/predict",
        json={"geography_id": "geo-in-madhya-pradesh", "planning_date": "2026-10-01"},
    )
    assert response.status_code == 401
    assert response.json() == {"error": "AUTH_TOKEN_REQUIRED"}


def test_planning_options_require_keycloak(client: TestClient) -> None:
    response = client.get("/climate/planning-options/geo-in-madhya-pradesh")
    assert response.status_code == 401
    assert response.json() == {"error": "AUTH_TOKEN_REQUIRED"}


def test_planning_options_return_relative_heat_season(
    authenticated_client: TestClient,
) -> None:
    options = PlanningOptionsResponse(
        geography_id="geo-in-madhya-pradesh",
        source_as_of="2026-07-22",
        validated_pregnancy_windows=[1],
        model_result_mode="single_association",
        custom_min_month="2026-07-01",
        custom_max_month="2026-12-01",
        next_three_months=HeatSeasonOptionResponse(
            label="Next 3 months (Aug–Oct 2026)",
            months=["2026-08-01", "2026-09-01", "2026-10-01"],
            planning_date="2026-10-01",
            available=True,
            source_name="C3S seasonal forecast",
            source_uri="https://cds.climate.copernicus.eu/",
        ),
        next_heat_season=HeatSeasonOptionResponse(
            label="Hot-weather season (Mar–May 2027)",
            months=["2027-03-01", "2027-04-01", "2027-05-01"],
            planning_date="2027-05-01",
            available=False,
            available_from="2026-12-07",
            unavailable_reason="CLIMATE_HORIZON_NOT_AVAILABLE",
            source_name="India Meteorological Department",
            source_uri="https://internal.imd.gov.in/",
        ),
    )
    with (
        patch(
            "chart.climate.routes.get_place_path",
            return_value="/india/madhya-pradesh",
        ),
        patch(
            "chart.climate.routes.get_planning_options",
            return_value=options,
        ),
    ):
        response = authenticated_client.get(
            "/climate/planning-options/geo-in-madhya-pradesh"
        )

    assert response.status_code == 200
    assert response.json()["custom_max_month"] == "2026-12-01"
    assert response.json()["next_three_months"]["planning_date"] == "2026-10-01"
    assert response.json()["next_heat_season"]["available"] is False
    assert response.json()["validated_pregnancy_windows"] == [1]
    assert response.json()["model_result_mode"] == "single_association"


def test_planning_options_deny_out_of_scope_place(client: TestClient) -> None:
    app.dependency_overrides[require_current_user] = lambda: CurrentUserContext(
        user_id="test-user",
        username="test-user",
        roles=["health_planning_lead"],
        geography_scopes=["/kenya/kajiado"],
    )
    try:
        with (
            patch(
                "chart.climate.routes.get_place_path",
                return_value="/india/madhya-pradesh",
            ),
            patch("chart.climate.routes.get_planning_options") as resolver,
        ):
            response = client.get("/climate/planning-options/geo-in-madhya-pradesh")
    finally:
        app.dependency_overrides.pop(require_current_user, None)

    assert response.status_code == 403
    assert response.json() == {"error": "GEOGRAPHY_OUT_OF_SCOPE"}
    resolver.assert_not_called()


def test_predict_returns_traceable_queued_request(
    authenticated_client: TestClient,
) -> None:
    with (
        patch(
            "chart.climate.routes.get_place_path",
            return_value="/india/madhya-pradesh",
        ),
        patch("chart.climate.routes.submit_prediction", return_value=_accepted()),
    ):
        response = authenticated_client.post(
            "/climate/predict",
            json={
                "geography_id": "geo-in-madhya-pradesh",
                "planning_date": "2026-10-01",
            },
        )
    assert response.status_code == 202
    assert response.headers["Retry-After"] == "3"
    assert response.json()["request_id"] == 12


def test_long_term_prediction_requires_an_explicit_approved_scenario(
    authenticated_client: TestClient,
) -> None:
    response = authenticated_client.post(
        "/climate/predict",
        json={
            "geography_id": "geo-in-madhya-pradesh",
            "planning_date": "2040-05-01",
            "planning_target": "long_term_hot_season",
            "projection_period": "2031-2040",
        },
    )

    assert response.status_code == 422


def test_long_term_prediction_passes_the_scenario_to_the_queue(
    authenticated_client: TestClient,
) -> None:
    accepted = PredictionAcceptedResponse(
        request_id=13,
        status="queued",
        stage="queued",
        geography_id="geo-in-madhya-pradesh",
        planning_date="2040-05-01",
        status_url="/climate/prediction-requests/13",
        message="Prediction is queued.",
        planning_target="long_term_hot_season",
        projection_scenario="ssp370",
        projection_period="2031-2040",
    )
    with (
        patch(
            "chart.climate.routes.get_place_path",
            return_value="/india/madhya-pradesh",
        ),
        patch(
            "chart.climate.routes.submit_prediction", return_value=accepted
        ) as submit,
    ):
        response = authenticated_client.post(
            "/climate/predict",
            json={
                "geography_id": "geo-in-madhya-pradesh",
                "planning_date": "2040-05-01",
                "planning_target": "long_term_hot_season",
                "projection_scenario": "ssp370",
                "projection_period": "2031-2040",
            },
        )

    assert response.status_code == 202
    request = submit.call_args.args[0]
    assert request.projection_scenario == "ssp370"
    assert response.json()["projection_period"] == "2031-2040"


def test_predict_denies_out_of_scope_place(client: TestClient) -> None:
    app.dependency_overrides[require_current_user] = lambda: CurrentUserContext(
        user_id="test-user",
        username="test-user",
        roles=["health_planning_lead"],
        geography_scopes=["/kenya/kajiado"],
    )
    try:
        with (
            patch(
                "chart.climate.routes.get_place_path",
                return_value="/india/madhya-pradesh",
            ),
            patch("chart.climate.routes.submit_prediction") as submit,
        ):
            response = client.post(
                "/climate/predict",
                json={
                    "geography_id": "geo-in-madhya-pradesh",
                    "planning_date": "2026-10-01",
                },
            )
    finally:
        app.dependency_overrides.pop(require_current_user, None)
    assert response.status_code == 403
    assert response.json() == {"error": "GEOGRAPHY_OUT_OF_SCOPE"}
    submit.assert_not_called()


def test_predict_denies_non_planning_role(client: TestClient) -> None:
    app.dependency_overrides[require_current_user] = lambda: CurrentUserContext(
        user_id="test-user",
        username="test-user",
        roles=["public_viewer"],
        geography_scopes=["/india/madhya-pradesh"],
    )
    try:
        with patch("chart.climate.routes.submit_prediction") as submit:
            response = client.post(
                "/climate/predict",
                json={
                    "geography_id": "geo-in-madhya-pradesh",
                    "planning_date": "2026-10-01",
                },
            )
    finally:
        app.dependency_overrides.pop(require_current_user, None)
    assert response.status_code == 403
    assert response.json() == {"error": "ROLE_NOT_ALLOWED"}
    submit.assert_not_called()


def test_status_checks_same_place_scope(authenticated_client: TestClient) -> None:
    with (
        patch("chart.climate.routes.get_prediction_request", return_value=_status()),
        patch(
            "chart.climate.routes.get_place_path",
            return_value="/india/madhya-pradesh",
        ),
    ):
        response = authenticated_client.get("/climate/prediction-requests/12")
    assert response.status_code == 200
    assert response.json()["planning_date"] == "2026-10-01"


def test_recent_requests_are_scoped_to_user_and_place(
    authenticated_client: TestClient,
) -> None:
    with (
        patch(
            "chart.climate.routes.get_place_path",
            return_value="/india/madhya-pradesh",
        ),
        patch(
            "chart.climate.routes.list_prediction_requests",
            return_value=_history(),
        ) as recent,
    ):
        response = authenticated_client.get(
            "/climate/prediction-requests",
            params={"geography_id": "geo-in-madhya-pradesh", "limit": 10},
        )

    assert response.status_code == 200
    assert response.json()["items"][0]["request_id"] == 12
    recent.assert_called_once_with(
        requested_by_user_id="test-user",
        geography_id="geo-in-madhya-pradesh",
        limit=10,
    )


def test_recent_requests_require_keycloak(client: TestClient) -> None:
    response = client.get(
        "/climate/prediction-requests",
        params={"geography_id": "geo-in-madhya-pradesh"},
    )
    assert response.status_code == 401
    assert response.json() == {"error": "AUTH_TOKEN_REQUIRED"}


def test_recent_requests_deny_out_of_scope_place(client: TestClient) -> None:
    app.dependency_overrides[require_current_user] = lambda: CurrentUserContext(
        user_id="test-user",
        username="test-user",
        roles=["health_planning_lead"],
        geography_scopes=["/kenya/kajiado"],
    )
    try:
        with (
            patch(
                "chart.climate.routes.get_place_path",
                return_value="/india/madhya-pradesh",
            ),
            patch("chart.climate.routes.list_prediction_requests") as recent,
        ):
            response = client.get(
                "/climate/prediction-requests",
                params={"geography_id": "geo-in-madhya-pradesh"},
            )
    finally:
        app.dependency_overrides.pop(require_current_user, None)

    assert response.status_code == 403
    assert response.json() == {"error": "GEOGRAPHY_OUT_OF_SCOPE"}
    recent.assert_not_called()
