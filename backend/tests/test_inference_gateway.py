from __future__ import annotations

import json
import urllib.error
from unittest.mock import patch

import pytest

from chart.inference import InferenceError, LbwScore, score_lbw
from chart.inference.explanations import explain_if_configured
from chart.inference.providers.lbw_r import LbwProviderError, call_lbw_r
from chart.inference.providers.openai_compatible import configured_explainer


def _score() -> LbwScore:
    return LbwScore(
        area="Bhopal",
        geography_level="division",
        pregnancy_window=1,
        temperatures_c=(31.0, 30.0, 29.0),
        reference_temperature_c=27.0,
        odds_ratio=1.12,
        ci95_low=1.02,
        ci95_high=1.22,
        on_training_support=True,
        model_file="division.rds",
        model_version="1.0.0",
        model_sha256="a" * 64,
        warning=None,
    )


def test_explanation_is_disabled_by_default(monkeypatch) -> None:
    monkeypatch.delenv("INFERENCE_LLM_ENABLED", raising=False)
    assert configured_explainer() is None
    assert explain_if_configured(_score()) is None


def test_openai_compatible_provider_is_selected_only_by_configuration(
    monkeypatch,
) -> None:
    monkeypatch.setenv("INFERENCE_LLM_ENABLED", "true")
    monkeypatch.setenv("INFERENCE_LLM_BASE_URL", "http://llama:8080/v1")
    monkeypatch.setenv("INFERENCE_LLM_MODEL", "qwen-small")
    provider = configured_explainer()
    assert provider is not None
    assert provider.base_url == "http://llama:8080/v1"
    assert provider.model == "qwen-small"


def test_explanation_failure_never_fails_the_statistical_result() -> None:
    provider = type(
        "BrokenProvider",
        (),
        {"explain": lambda self, score: (_ for _ in ()).throw(TimeoutError())},
    )()
    assert explain_if_configured(_score(), provider) is None


def test_explanation_success_is_kept_separate() -> None:
    provider = type(
        "Provider",
        (),
        {"explain": lambda self, score: "Use this result for planning only."},
    )()
    with patch("chart.inference.explanations.configured_explainer") as configured:
        assert (
            explain_if_configured(_score(), provider)
            == "Use this result for planning only."
        )
    configured.assert_not_called()


def test_lbw_provider_sends_the_r_api_temperature_field() -> None:
    response = {
        "area": "Madhya Pradesh",
        "geography_level": "state",
        "trimester": 1,
        "tmax_lag": [31.0, 30.0, 29.0],
        "ref_temp": 27.0,
        "odds_ratio": 1.12,
        "ci95_low": 1.02,
        "ci95_high": 1.22,
        "on_training_support": True,
        "model_file": "state.rds",
        "model_version": "1.0.0",
        "model_sha256": "a" * 64,
    }

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self):
            return json.dumps(response).encode("utf-8")

    with patch(
        "chart.inference.providers.lbw_r.urllib.request.urlopen",
        return_value=FakeResponse(),
    ) as urlopen:
        result = call_lbw_r(
            "http://lbw.test",
            model_area="Madhya Pradesh",
            pregnancy_window=1,
            temperatures_c=(31.0, 30.0, 29.0),
        )

    sent = json.loads(urlopen.call_args.args[0].data.decode("utf-8"))
    assert sent["tmax_lag"] == [31.0, 30.0, 29.0]
    assert "tmax" not in sent
    assert result["odds_ratio"] == 1.12


def test_score_rejects_a_response_for_different_inputs() -> None:
    payload = {
        "area": "Madhya Pradesh",
        "geography_level": "state",
        "trimester": 1,
        "tmax_lag": [99.0, 30.0, 29.0],
        "ref_temp": 27.0,
        "odds_ratio": 1.12,
        "ci95_low": 1.02,
        "ci95_high": 1.22,
        "on_training_support": True,
        "model_file": "state.rds",
        "model_version": "1.0.0",
        "model_sha256": "a" * 64,
    }
    with (
        patch("chart.inference.service.call_lbw_r", return_value=payload),
        pytest.raises(InferenceError) as caught,
    ):
        score_lbw(
            model_area="Madhya Pradesh",
            pregnancy_window=1,
            temperatures_c=(31.0, 30.0, 29.0),
            service_url="http://lbw.test",
            expected_model_version="1.0.0",
            expected_model_sha256="a" * 64,
        )

    assert caught.value.code == "LBW_RESPONSE_INPUT_MISMATCH"


def test_score_rejects_an_invalid_response_pregnancy_window() -> None:
    payload = {
        "area": "Madhya Pradesh",
        "geography_level": "state",
        "trimester": 4,
        "tmax_lag": [31.0, 30.0, 29.0],
        "ref_temp": 27.0,
        "odds_ratio": 1.12,
        "ci95_low": 1.02,
        "ci95_high": 1.22,
        "on_training_support": True,
        "model_file": "state.rds",
        "model_version": "1.0.0",
        "model_sha256": "a" * 64,
    }
    with (
        patch("chart.inference.service.call_lbw_r", return_value=payload),
        pytest.raises(InferenceError) as caught,
    ):
        score_lbw(
            model_area="Madhya Pradesh",
            pregnancy_window=1,
            temperatures_c=(31.0, 30.0, 29.0),
            service_url="http://lbw.test",
            expected_model_version="1.0.0",
            expected_model_sha256="a" * 64,
        )

    assert caught.value.code == "LBW_RESPONSE_INVALID"
    assert caught.value.detail == "trimester must be 1, 2, or 3"


def test_lbw_provider_reports_an_unavailable_service_clearly() -> None:
    with (
        patch(
            "chart.inference.providers.lbw_r.urllib.request.urlopen",
            side_effect=urllib.error.URLError("Connection refused"),
        ),
        pytest.raises(LbwProviderError) as caught,
    ):
        call_lbw_r(
            "http://lbw.test",
            model_area="Madhya Pradesh",
            pregnancy_window=1,
            temperatures_c=(31.0, 30.0, 29.0),
        )

    assert caught.value.code == "LBW_SERVICE_UNAVAILABLE"
