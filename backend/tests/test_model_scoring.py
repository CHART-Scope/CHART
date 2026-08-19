from __future__ import annotations

from unittest.mock import patch

import pytest

from chart.climate.model_scoring import score_lbw_model
from chart.inference import InferenceError, LbwScore
from chart.model_registry.service import ActiveModelMapping


def _model() -> ActiveModelMapping:
    return ActiveModelMapping(
        release_id="lbw-mp-1.0.1-compact-review",
        version="1.0.1-compact-review",
        model_area_name="Madhya Pradesh",
        model_file="IN_MP_LBW_tmax_v1.0.1-compact.rds",
        artifact_sha256="a" * 64,
        validated_pregnancy_windows=(1,),
    )


def _score() -> LbwScore:
    return LbwScore(
        area="Madhya Pradesh",
        geography_level="state",
        pregnancy_window=1,
        temperatures_c=(27.0, 27.0, 27.0),
        reference_temperature_c=27.0,
        odds_ratio=1.0,
        ci95_low=1.0,
        ci95_high=1.0,
        on_training_support=True,
        model_file="IN_MP_LBW_tmax_v1.0.1-compact.rds",
        model_version="1.0.1-compact-review",
        model_sha256="a" * 64,
        warning=None,
        modelled_temperature_range_c=(18.46, 44.42),
    )


def test_missing_runtime_model_is_reloaded_and_scored() -> None:
    missing = InferenceError(
        "LBW_PREDICT_FAILED", '{"error":"MODEL_RELEASE_NOT_LOADED"}'
    )
    with (
        patch(
            "chart.climate.model_scoring.score_lbw",
            side_effect=[missing, missing, _score()],
        ) as score,
        patch("chart.climate.model_scoring.warm_model_artifact") as warm,
    ):
        result = score_lbw_model(
            _model(), pregnancy_window=1, temperatures_c=(27.0, 27.0, 27.0)
        )

    assert result.modelled_temperature_range_c == (18.46, 44.42)
    assert score.call_count == 3
    warm.assert_called_once_with(
        release_id="lbw-mp-1.0.1-compact-review",
        model_version="1.0.1-compact-review",
        model_file="IN_MP_LBW_tmax_v1.0.1-compact.rds",
        model_sha256="a" * 64,
        service_url=None,
    )


def test_other_inference_failures_are_not_hidden_by_reload() -> None:
    failure = InferenceError("LBW_RESPONSE_INVALID", "bad response")
    with (
        patch("chart.climate.model_scoring.score_lbw", side_effect=failure),
        patch("chart.climate.model_scoring.warm_model_artifact") as warm,
        pytest.raises(InferenceError) as caught,
    ):
        score_lbw_model(_model(), pregnancy_window=1, temperatures_c=(27.0, 27.0, 27.0))

    assert caught.value.code == "LBW_RESPONSE_INVALID"
    warm.assert_not_called()
