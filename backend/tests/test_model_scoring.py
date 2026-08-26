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


def test_editorial_reference_from_manifest_is_forwarded_to_scorer() -> None:
    """When the manifest declares an editorial anchor, the wrapper reads
    ``presentation.editorial_reference_temperature_c`` and forwards it to
    ``score_lbw`` so the R runtime re-anchors the DLNM crosspred there
    instead of using the block's bundled MMT."""

    model = ActiveModelMapping(
        release_id="lbw-mp-1.0.1-compact-review",
        version="1.0.1-compact-review",
        model_area_name="Madhya Pradesh",
        model_file="IN_MP_LBW_tmax_v1.0.1-compact.rds",
        artifact_sha256="a" * 64,
        validated_pregnancy_windows=(1,),
        input_spec={
            "presentation": {"editorial_reference_temperature_c": 27.0},
            "output_contract": {"attributable_fraction": "positive_excess_only"},
        },
    )
    with patch("chart.climate.model_scoring.score_lbw", return_value=_score()) as score:
        score_lbw_model(model, pregnancy_window=1, temperatures_c=(27.0, 27.0, 27.0))
    assert score.call_args.kwargs["reference_temperature_c"] == 27.0


def test_missing_editorial_reference_leaves_bundled_mmt_in_place() -> None:
    """Releases without an editorial anchor (e.g. Kenya climate-zone LBW)
    must not forward a ``reference_temperature_c`` — the R runtime should
    keep its per-block MMT."""

    with patch("chart.climate.model_scoring.score_lbw", return_value=_score()) as score:
        score_lbw_model(_model(), pregnancy_window=1, temperatures_c=(27.0, 27.0, 27.0))
    assert score.call_args.kwargs["reference_temperature_c"] is None


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
