from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

import dagster as dg

from chart.climate.requests import QueuedPredictionRequest
from chart.climate.service import ClimateServiceError
from chart_pipeline.definitions import (
    pending_prediction_requests_sensor,
    prediction_request_job,
)


def _run_config() -> dict:
    return {
        "ops": {
            "process_prediction_request": {
                "config": {
                    "request_id": 42,
                    "location_slug": "madhya-pradesh",
                    "end_year": 2024,
                    "use_fixture": True,
                }
            }
        }
    }


def test_sensor_launches_only_the_requested_geography_partition() -> None:
    queued = QueuedPredictionRequest(
        id=42,
        location_slug="madhya-pradesh",
        end_month="2024-12",
        attempt_count=1,
    )

    with patch(
        "chart_pipeline.definitions.list_queued_prediction_requests",
        return_value=[queued],
    ):
        result = pending_prediction_requests_sensor(dg.build_sensor_context())
        run_requests = list(result)

    assert len(run_requests) == 1
    assert run_requests[0].run_key == "prediction-request:42:attempt:1"
    config = run_requests[0].run_config["ops"]["process_prediction_request"]["config"]
    assert config["request_id"] == 42
    assert config["location_slug"] == "madhya-pradesh"
    assert config["end_year"] == 2024


def test_prediction_job_skips_climate_pull_when_prediction_is_ready() -> None:
    prediction = SimpleNamespace(prediction=SimpleNamespace(odds_ratio=1.12))
    with (
        patch("chart_pipeline.definitions.mark_prediction_request_running"),
        patch(
            "chart_pipeline.definitions.complete_prediction_request",
            return_value=prediction,
        ) as complete_mock,
        patch("chart_pipeline.definitions._prepare_era5_climate") as prepare_mock,
        patch("chart_pipeline.definitions.fail_prediction_request") as fail_mock,
    ):
        result = prediction_request_job.execute_in_process(run_config=_run_config())

    assert result.success
    complete_mock.assert_called_once_with(42)
    prepare_mock.assert_not_called()
    fail_mock.assert_not_called()


def test_prediction_job_pulls_missing_climate_before_retrying() -> None:
    prediction = SimpleNamespace(prediction=SimpleNamespace(odds_ratio=1.12))
    with (
        patch("chart_pipeline.definitions.mark_prediction_request_running"),
        patch(
            "chart_pipeline.definitions.complete_prediction_request",
            side_effect=[
                ClimateServiceError("CLIMATE_DATA_NOT_READY", 409),
                prediction,
            ],
        ) as complete_mock,
        patch(
            "chart_pipeline.definitions._prepare_era5_climate",
            return_value={"rows": 3},
        ) as prepare_mock,
        patch("chart_pipeline.definitions.set_prediction_request_stage") as stage_mock,
        patch("chart_pipeline.definitions.fail_prediction_request") as fail_mock,
    ):
        result = prediction_request_job.execute_in_process(run_config=_run_config())

    assert result.success
    assert complete_mock.call_count == 2
    prepare_mock.assert_called_once()
    assert [call.args for call in stage_mock.call_args_list] == [
        (42, "preparing_climate"),
        (42, "predicting"),
    ]
    fail_mock.assert_not_called()


def test_prediction_job_records_missing_cds_configuration() -> None:
    run_config = _run_config()
    run_config["ops"]["process_prediction_request"]["config"][
        "use_fixture"
    ] = False

    with (
        patch("chart_pipeline.definitions.mark_prediction_request_running"),
        patch("chart_pipeline.definitions.set_prediction_request_stage"),
        patch(
            "chart_pipeline.definitions.complete_prediction_request",
            side_effect=ClimateServiceError("CLIMATE_DATA_NOT_READY", 409),
        ),
        patch(
            "chart_pipeline.definitions._cds_credentials_available",
            return_value=False,
        ),
        patch("chart_pipeline.definitions.fail_prediction_request") as fail_mock,
    ):
        result = prediction_request_job.execute_in_process(
            run_config=run_config,
            raise_on_error=False,
        )

    assert not result.success
    fail_mock.assert_called_once_with(
        42,
        error_code="CLIMATE_INGEST_NOT_CONFIGURED",
    )
