"""HTTP + service tests for the fitted-curve publication endpoint."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from chart.api.app import app
from chart.erf_registry import routes as erf_routes
from chart.shared.db.base import Base
from chart.shared.db.models import ErfParameters, Geography


INTERNAL_TOKEN = "test-modeler-token"


@pytest.fixture
def isolated_session_factory():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with engine.begin() as connection:
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    with factory() as session:
        session.add(
            Geography(slug="madhya-pradesh", country="India", name="Madhya Pradesh")
        )
        session.commit()

    return factory


@pytest.fixture
def modeler_client(
    isolated_session_factory, monkeypatch
) -> Iterator[TestClient]:
    monkeypatch.setenv(erf_routes._INTERNAL_TOKEN_ENV, INTERNAL_TOKEN)
    monkeypatch.setattr(
        erf_routes, "get_session_factory", lambda: isolated_session_factory
    )
    with TestClient(app) as client:
        yield client


def _valid_payload(**overrides) -> dict:
    base = {
        "geography_slug": "madhya-pradesh",
        "outcome": "lbw",
        "spline_coefficients": {"knots": [22.0, 27.0, 33.0], "coefs": [0.1, 0.4]},
        "lag_window": {
            "months": [1, 2, 3],
            "trimester_weights": [0.3, 0.4, 0.3],
        },
        "reference_percentile": 27.0,
        "projection_source": "ISIMIP3b",
        "git_ref": "modeler-abc123",
        "notes": "Placeholder scaffolding curve.",
    }
    base.update(overrides)
    return base


def _auth() -> dict[str, str]:
    return {"authorization": f"Bearer {INTERNAL_TOKEN}"}


def test_publish_curve_persists_row(modeler_client, isolated_session_factory) -> None:
    response = modeler_client.post(
        "/internal/erf-parameters", json=_valid_payload(), headers=_auth()
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["created"] is True
    assert body["outcome"] == "lbw"
    assert body["reference_percentile"] == 27.0

    with isolated_session_factory() as session:
        stored = session.scalars(select(ErfParameters)).one()
        assert stored.reference_percentile_milli == 27000
        assert stored.lag_window["trimester_weights"] == [0.3, 0.4, 0.3]


def test_publish_is_idempotent_on_git_ref(modeler_client) -> None:
    first = modeler_client.post(
        "/internal/erf-parameters", json=_valid_payload(), headers=_auth()
    )
    second = modeler_client.post(
        "/internal/erf-parameters", json=_valid_payload(), headers=_auth()
    )
    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["id"] == second.json()["id"]
    assert first.json()["created"] is True
    assert second.json()["created"] is False


def test_publish_rejects_missing_token(modeler_client) -> None:
    response = modeler_client.post(
        "/internal/erf-parameters", json=_valid_payload()
    )
    assert response.status_code == 401
    assert response.json()["error"] == "INTERNAL_TOKEN_INVALID"


def test_publish_rejects_wrong_token(modeler_client) -> None:
    response = modeler_client.post(
        "/internal/erf-parameters",
        json=_valid_payload(),
        headers={"authorization": "Bearer wrong-token"},
    )
    assert response.status_code == 401


def test_publish_returns_503_when_endpoint_unconfigured(
    isolated_session_factory, monkeypatch
) -> None:
    monkeypatch.delenv(erf_routes._INTERNAL_TOKEN_ENV, raising=False)
    monkeypatch.setattr(
        erf_routes, "get_session_factory", lambda: isolated_session_factory
    )
    with TestClient(app) as client:
        response = client.post(
            "/internal/erf-parameters",
            json=_valid_payload(),
            headers={"authorization": "Bearer anything"},
        )
    assert response.status_code == 503
    assert response.json()["error"] == "INTERNAL_API_NOT_CONFIGURED"


def test_publish_returns_404_for_unknown_geography(modeler_client) -> None:
    response = modeler_client.post(
        "/internal/erf-parameters",
        json=_valid_payload(geography_slug="mars-crater"),
        headers=_auth(),
    )
    assert response.status_code == 404
    assert response.json()["error"] == "GEOGRAPHY_NOT_FOUND"


def test_publish_rejects_lag_weights_that_do_not_sum_to_one(modeler_client) -> None:
    response = modeler_client.post(
        "/internal/erf-parameters",
        json=_valid_payload(
            lag_window={"months": [1, 2, 3], "trimester_weights": [0.5, 0.5, 0.5]}
        ),
        headers=_auth(),
    )
    assert response.status_code == 422


def test_publish_rejects_lag_weights_length_mismatch(modeler_client) -> None:
    response = modeler_client.post(
        "/internal/erf-parameters",
        json=_valid_payload(
            lag_window={"months": [1, 2, 3], "trimester_weights": [1.0]}
        ),
        headers=_auth(),
    )
    assert response.status_code == 422


def test_publish_rejects_reference_percentile_out_of_range(modeler_client) -> None:
    response = modeler_client.post(
        "/internal/erf-parameters",
        json=_valid_payload(reference_percentile=150.0),
        headers=_auth(),
    )
    assert response.status_code == 422
