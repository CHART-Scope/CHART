from __future__ import annotations

from datetime import date, datetime, timezone
from types import SimpleNamespace
from unittest.mock import call, patch

import dagster as dg
import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from chart.climate.requests import QueuedPredictionRequest
from chart.climate.service import ClimateServiceError
from chart.shared.db.base import Base
from chart.shared.db.models import AdminUnit, ClimateRun, Geography
from chart_pipeline.definitions import (
    _load_fixture,
    _load_projection,
    _prepare_required_climate,
    pending_prediction_requests_sensor,
    prediction_request_job,
)


@pytest.fixture(autouse=True)
def prediction_heartbeat_succeeds():
    with patch(
        "chart_pipeline.definitions.heartbeat_prediction_request",
        return_value=True,
    ):
        yield


def test_projection_source_failure_is_explicit_and_never_falls_back() -> None:
    context = SimpleNamespace(log=SimpleNamespace(info=lambda *_args: None))
    with (
        patch(
            "chart_pipeline.definitions.prepare_projection_records",
            side_effect=ConnectionError("repository offline"),
        ),
        pytest.raises(ClimateServiceError) as captured,
    ):
        _load_projection(
            context,
            {
                "id": 1,
                "code": "madhya-pradesh",
                "name": "Madhya Pradesh",
                "level": "state",
                "bbox": (26.87, 74.02, 21.08, 82.82),
                "geometry": {},
                "boundary_version": "test-v1",
            },
            [date(2040, 3, 1), date(2040, 4, 1), date(2040, 5, 1)],
            "ssp370",
            "2031-2040",
            None,
        )

    assert captured.value.code == "CLIMATE_PROJECTION_SOURCE_UNAVAILABLE"


def _run_config(use_fixture: bool = True) -> dict:
    return {
        "ops": {
            "process_prediction_request": {
                "config": {
                    "request_id": 42,
                    "geography_id": "geo-in-madhya-pradesh",
                    "admin_unit_id": 7,
                    "planning_date": "2026-10-01",
                    "source_as_of": "2026-07-22",
                    "lease_token": "test-lease-token",
                    "use_fixture": use_fixture,
                }
            }
        }
    }


def test_sensor_carries_place_and_planning_date() -> None:
    queued = QueuedPredictionRequest(
        id=42,
        geography_id="geo-in-madhya-pradesh",
        admin_unit_id=7,
        planning_date=date(2026, 10, 1),
        source_as_of=datetime(2026, 7, 22, tzinfo=timezone.utc),
        attempt_count=1,
        lease_token="test-lease-token",
    )
    with (
        patch("chart_pipeline.definitions.activate_waiting_prediction_requests"),
        patch(
            "chart_pipeline.definitions.reserve_queued_prediction_requests",
            return_value=[queued],
        ),
    ):
        requests = list(pending_prediction_requests_sensor(dg.build_sensor_context()))
    config = requests[0].run_config["ops"]["process_prediction_request"]["config"]
    assert config["geography_id"] == queued.geography_id
    assert config["admin_unit_id"] == 7
    assert config["planning_date"] == "2026-10-01"
    assert config["source_as_of"] == "2026-07-22T00:00:00+00:00"
    assert config["lease_token"] == "test-lease-token"


def test_sensor_carries_the_explicit_long_term_choice() -> None:
    queued = QueuedPredictionRequest(
        id=43,
        geography_id="geo-in-madhya-pradesh",
        admin_unit_id=7,
        planning_date=date(2040, 5, 1),
        source_as_of=datetime(2026, 7, 22, tzinfo=timezone.utc),
        attempt_count=1,
        lease_token="test-lease-token",
        planning_target="long_term_hot_season",
        projection_scenario="ssp126",
        projection_period="2031-2040",
    )
    with (
        patch("chart_pipeline.definitions.activate_waiting_prediction_requests"),
        patch(
            "chart_pipeline.definitions.reserve_queued_prediction_requests",
            return_value=[queued],
        ),
    ):
        requests = list(pending_prediction_requests_sensor(dg.build_sensor_context()))

    config = requests[0].run_config["ops"]["process_prediction_request"]["config"]
    assert config["planning_target"] == "long_term_hot_season"
    assert config["projection_scenario"] == "ssp126"
    assert config["projection_period"] == "2031-2040"


def test_job_never_calls_model_before_input_is_persisted() -> None:
    events = []

    def prepared(*_args, **_kwargs):
        events.append("input")
        return 9

    def completed(*_args, **_kwargs):
        events.append("model")
        return SimpleNamespace(prediction=SimpleNamespace(odds_ratio=1.12))

    with (
        patch("chart_pipeline.definitions.claim_prediction_request", return_value=True),
        patch(
            "chart_pipeline.definitions.prepare_prediction_input", side_effect=prepared
        ),
        patch(
            "chart_pipeline.definitions.complete_prediction_request",
            side_effect=completed,
        ),
        patch("chart_pipeline.definitions.set_prediction_request_stage"),
        patch("chart_pipeline.definitions._prepare_required_climate") as climate_pull,
        patch("chart_pipeline.definitions.fail_prediction_request"),
    ):
        result = prediction_request_job.execute_in_process(run_config=_run_config())
    assert result.success
    assert events == ["input", "model"]
    climate_pull.assert_not_called()


def test_job_pulls_data_then_revalidates_before_model() -> None:
    prediction = SimpleNamespace(prediction=SimpleNamespace(odds_ratio=1.12))
    with (
        patch("chart_pipeline.definitions.claim_prediction_request", return_value=True),
        patch(
            "chart_pipeline.definitions.prepare_prediction_input",
            side_effect=[ClimateServiceError("CLIMATE_DATA_NOT_READY", 409), 9],
        ) as prepare,
        patch(
            "chart_pipeline.definitions._prepare_required_climate",
            return_value={"new_runs": 1},
        ) as climate_pull,
        patch(
            "chart_pipeline.definitions.complete_prediction_request",
            return_value=prediction,
        ),
        patch("chart_pipeline.definitions.set_prediction_request_stage"),
        patch("chart_pipeline.definitions.fail_prediction_request"),
    ):
        result = prediction_request_job.execute_in_process(run_config=_run_config())
    assert result.success
    assert prepare.call_count == 2
    climate_pull.assert_called_once()
    assert climate_pull.call_args.kwargs["source_as_of"].date() == date(2026, 7, 22)


def test_job_can_refresh_a_sample_found_after_missing_months() -> None:
    prediction = SimpleNamespace(prediction=SimpleNamespace(odds_ratio=1.12))
    with (
        patch("chart_pipeline.definitions.claim_prediction_request", return_value=True),
        patch(
            "chart_pipeline.definitions.prepare_prediction_input",
            side_effect=[
                ClimateServiceError("CLIMATE_DATA_NOT_READY", 409),
                ClimateServiceError("CLIMATE_SAMPLE_NOT_LIVE", 409),
                9,
            ],
        ) as prepare,
        patch(
            "chart_pipeline.definitions._prepare_required_climate",
            return_value={"new_runs": 1},
        ) as climate_pull,
        patch(
            "chart_pipeline.definitions.complete_prediction_request",
            return_value=prediction,
        ),
        patch("chart_pipeline.definitions.set_prediction_request_stage"),
        patch("chart_pipeline.definitions.fail_prediction_request"),
    ):
        result = prediction_request_job.execute_in_process(run_config=_run_config())

    assert result.success
    assert prepare.call_count == 3
    assert climate_pull.call_count == 2


def test_job_refreshes_all_three_months_after_grain_mismatch() -> None:
    prediction = SimpleNamespace(prediction=SimpleNamespace(odds_ratio=1.12))
    with (
        patch("chart_pipeline.definitions.claim_prediction_request", return_value=True),
        patch(
            "chart_pipeline.definitions.prepare_prediction_input",
            side_effect=[
                ClimateServiceError("CLIMATE_WINDOW_GRAIN_MISMATCH", 409),
                9,
            ],
        ),
        patch(
            "chart_pipeline.definitions._prepare_required_climate",
            return_value={"new_runs": 1},
        ) as climate_pull,
        patch(
            "chart_pipeline.definitions.complete_prediction_request",
            return_value=prediction,
        ),
        patch("chart_pipeline.definitions.set_prediction_request_stage"),
        patch("chart_pipeline.definitions.fail_prediction_request"),
    ):
        result = prediction_request_job.execute_in_process(run_config=_run_config())

    assert result.success
    assert climate_pull.call_args.kwargs["force_full_window"] is True


def test_job_records_source_failure() -> None:
    with (
        patch("chart_pipeline.definitions.claim_prediction_request", return_value=True),
        patch(
            "chart_pipeline.definitions.prepare_prediction_input",
            side_effect=ClimateServiceError("CLIMATE_DATA_NOT_READY", 409),
        ),
        patch(
            "chart_pipeline.definitions._prepare_required_climate",
            side_effect=ClimateServiceError("CLIMATE_INGEST_NOT_CONFIGURED", 503),
        ),
        patch("chart_pipeline.definitions.fail_prediction_request") as failed,
    ):
        result = prediction_request_job.execute_in_process(
            run_config=_run_config(False), raise_on_error=False
        )
    assert not result.success
    assert failed.call_args == call(
        42,
        error_code="CLIMATE_INGEST_NOT_CONFIGURED",
        lease_token="test-lease-token",
    )


def test_fixture_keeps_future_sample_rows_out_of_era5(tmp_path, monkeypatch) -> None:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    with session_factory() as session:
        geography = Geography(
            slug="madhya-pradesh",
            country="India",
            name="Madhya Pradesh",
        )
        session.add(geography)
        session.flush()
        admin_unit = AdminUnit(
            geography_id=geography.id,
            level="state",
            code="madhya-pradesh",
            name="Madhya Pradesh",
            boundary_version="test-boundary-v1",
        )
        session.add(admin_unit)
        session.commit()
        place_id = admin_unit.id

    monkeypatch.setenv("CLIMATE_OUTPUT_DIR", str(tmp_path))
    context = SimpleNamespace(log=SimpleNamespace(info=lambda *_args: None))
    run_ids = _load_fixture(
        context,
        {
            "id": place_id,
            "code": "madhya-pradesh",
            "level": "state",
            "boundary_version": "test-boundary-v1",
        },
        date(2026, 8, 1),
        [date(2026, 8, 1), date(2026, 6, 1)],
        datetime(2026, 7, 22, tzinfo=timezone.utc),
        session_factory,
    )

    with session_factory() as session:
        runs = session.scalars(
            select(ClimateRun).where(ClimateRun.id.in_(run_ids))
        ).all()
        classes = {
            run.source_class: {row.period_month for row in run.district_climate}
            for run in runs
        }

    assert classes == {
        "observed": {date(2026, 6, 1)},
        "seasonal": {date(2026, 8, 1)},
    }


def test_live_refresh_includes_sample_rows_alongside_missing_rows() -> None:
    sample_run = SimpleNamespace(
        data_label=SimpleNamespace(value="sample"),
        quality_status="sample",
        fresh_until=None,
    )
    sample_row = (SimpleNamespace(), sample_run, SimpleNamespace(), SimpleNamespace())
    admin_unit = SimpleNamespace(id=7)

    class FakeSession:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def get(self, _model, _id):
            return admin_unit

    selected = [
        (date(2026, 8, 1), None),
        (date(2026, 7, 1), None),
        (date(2026, 6, 1), sample_row),
    ]
    context = SimpleNamespace(log=SimpleNamespace(info=lambda *_args: None))
    with (
        patch(
            "chart_pipeline.definitions.get_session_factory",
            return_value=lambda: FakeSession(),
        ),
        patch("chart_pipeline.definitions.select_input_months", return_value=selected),
        patch(
            "chart_pipeline.definitions._place_snapshot",
            return_value={
                "id": 7,
                "code": "madhya-pradesh",
                "boundary_version": "test-v1",
            },
        ),
        patch(
            "chart_pipeline.definitions.run_single_flight_ingestion",
            side_effect=lambda _identity, loader, **_kwargs: loader(),
        ),
        patch("chart_pipeline.definitions._load_observed", return_value=21) as observed,
        patch("chart_pipeline.definitions._load_seasonal", return_value=22) as seasonal,
    ):
        metadata = _prepare_required_climate(
            context,
            admin_unit_id=7,
            planning_date=date(2026, 8, 1),
            source_as_of=datetime(2026, 7, 22, tzinfo=timezone.utc),
            use_fixture=False,
        )

    observed.assert_called_once()
    assert observed.call_args.args[2] == [date(2026, 6, 1)]
    seasonal.assert_called_once()
    assert seasonal.call_args.args[2] == [
        date(2026, 8, 1),
        date(2026, 7, 1),
    ]
    assert metadata["new_runs"] == 2
