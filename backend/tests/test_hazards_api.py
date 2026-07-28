from __future__ import annotations

from unittest.mock import patch

from fastapi.testclient import TestClient

from chart.api.app import app


def test_hazard_list_is_public_and_repository_backed() -> None:
    hazard = {
        "id": "hazard-extreme-heat",
        "label": "Extreme heat",
        "description": None,
        "hazardGroup": None,
        "imageUrl": None,
        "solutionCount": 2,
    }
    with (
        patch("chart.solution_repository.hazards._remote", return_value=None),
        patch(
            "chart.solution_repository.hazards._local_hazards", return_value=[hazard]
        ),
    ):
        response = TestClient(app).get("/hazards")
    assert response.status_code == 200
    assert response.json() == {"items": [hazard]}


def test_missing_hazard_is_explicit() -> None:
    with (
        patch("chart.solution_repository.hazards._remote", return_value=None),
        patch("chart.solution_repository.hazards._local_hazards", return_value=[]),
    ):
        response = TestClient(app).get("/hazards/missing")
    assert response.status_code == 404
    assert response.json() == {"error": "HAZARD_NOT_FOUND"}
