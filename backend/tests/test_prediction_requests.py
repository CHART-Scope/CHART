from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import patch

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from chart.climate.requests import (
    complete_prediction_request,
    fail_prediction_request,
    get_prediction_request,
    mark_prediction_request_running,
    submit_prediction,
)
from chart.climate.schemas import (
    Availability,
    MonthValue,
    PredictRequest,
    PredictResponse,
    PredictionAcceptedResponse,
)
from chart.climate.service import ClimateServiceError
from chart.shared.db.base import Base
from chart.shared.db.models import PredictionRequestRecord


@pytest.fixture
def session_factory():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)


def prediction_request() -> PredictRequest:
    return PredictRequest(
        location_slug="madhya-pradesh",
        timeframe_id="exposure_3m",
        end_month="2024-12",
        outcome={"type": "lbw", "trimester": 1},
    )


def completed_prediction() -> PredictResponse:
    return PredictResponse(
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
            "description": "Last three monthly means.",
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
            last_refreshed_at=datetime.now(timezone.utc).isoformat(),
            climate_run_id=7,
            data_label="reanalysis",
            pull_required=False,
            pull_hint=None,
        ),
        series=[
            MonthValue(month="2024-10", tmax_monthly_mean_c=31.2),
            MonthValue(month="2024-11", tmax_monthly_mean_c=30.4),
            MonthValue(month="2024-12", tmax_monthly_mean_c=29.1),
        ],
        prediction={
            "area": "Madhya Pradesh",
            "geography_level": "state",
            "trimester": 1,
            "tmax_lag": [29.1, 30.4, 31.2],
            "ref_temp": 27.0,
            "odds_ratio": 1.12,
            "ci95_low": 1.02,
            "ci95_high": 1.22,
            "on_training_support": True,
            "model_file": "state.rds",
        },
        prediction_note=None,
    )


def test_outcome_prediction_creates_one_durable_queued_request(session_factory) -> None:
    request = prediction_request()

    with patch("chart.climate.requests.predict") as predict_mock:
        first = submit_prediction(request, session_factory=session_factory)
        second = submit_prediction(request, session_factory=session_factory)

    assert isinstance(first, PredictionAcceptedResponse)
    assert first.status == "queued"
    assert first.stage == "queued"
    assert second.request_id == first.request_id
    predict_mock.assert_not_called()

    with session_factory() as session:
        records = session.scalars(select(PredictionRequestRecord)).all()
    assert len(records) == 1
    assert records[0].status == "queued"
    assert records[0].request_payload["outcome"]["type"] == "lbw"


def test_completed_duplicate_returns_persisted_prediction(session_factory) -> None:
    request = prediction_request()
    accepted = submit_prediction(request, session_factory=session_factory)
    result = completed_prediction()

    with patch("chart.climate.requests.predict", return_value=result):
        complete_prediction_request(
            accepted.request_id,
            session_factory=session_factory,
        )
    with patch("chart.climate.requests.predict") as predict_mock:
        response = submit_prediction(request, session_factory=session_factory)

    assert isinstance(response, PredictResponse)
    assert response.request_id == accepted.request_id
    assert response.request_status == "completed"
    predict_mock.assert_not_called()

    status = get_prediction_request(
        response.request_id, session_factory=session_factory
    )
    assert status.status == "completed"
    assert status.result is not None
    assert status.result.prediction is not None
    assert status.result.prediction.odds_ratio == 1.12


def test_running_duplicate_returns_the_existing_request(session_factory) -> None:
    request = prediction_request()
    accepted = submit_prediction(request, session_factory=session_factory)
    mark_prediction_request_running(
        accepted.request_id,
        dagster_run_id="dagster-run-1",
        session_factory=session_factory,
    )

    duplicate = submit_prediction(request, session_factory=session_factory)

    assert isinstance(duplicate, PredictionAcceptedResponse)
    assert duplicate.request_id == accepted.request_id
    assert duplicate.status == "running"
    assert duplicate.stage == "predicting"


def test_dagster_completion_scores_and_updates_queued_request(session_factory) -> None:
    accepted = submit_prediction(prediction_request(), session_factory=session_factory)

    result = completed_prediction()
    with patch("chart.climate.requests.predict", return_value=result):
        complete_prediction_request(
            accepted.request_id,
            session_factory=session_factory,
        )

    status = get_prediction_request(
        accepted.request_id, session_factory=session_factory
    )
    assert status.status == "completed"
    assert status.result is not None
    assert status.result.request_id == accepted.request_id
    assert status.result.prediction.odds_ratio == 1.12


def test_failed_request_is_requeued_on_the_next_submit(session_factory) -> None:
    request = prediction_request()
    accepted = submit_prediction(request, session_factory=session_factory)
    fail_prediction_request(
        accepted.request_id,
        error_code="LBW_PREDICT_FAILED",
        session_factory=session_factory,
    )

    retried = submit_prediction(request, session_factory=session_factory)

    assert isinstance(retried, PredictionAcceptedResponse)
    assert retried.request_id == accepted.request_id
    assert retried.status == "queued"
    with session_factory() as session:
        record = session.get(PredictionRequestRecord, accepted.request_id)
    assert record.attempt_count == 2
    assert record.error_code is None


def test_unsupported_location_is_rejected_before_queueing(session_factory) -> None:
    request = prediction_request().model_copy(update={"location_slug": "kajiado"})

    with pytest.raises(ClimateServiceError, match="LBW_NOT_AVAILABLE_FOR_LOCATION"):
        submit_prediction(request, session_factory=session_factory)

    with session_factory() as session:
        assert session.scalars(select(PredictionRequestRecord)).all() == []
