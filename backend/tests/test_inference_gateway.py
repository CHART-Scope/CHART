from __future__ import annotations

import json
import urllib.error
from unittest.mock import patch

import pytest

from chart.inference import InferenceError, LbwScore, score_association, score_lbw
from chart.inference.explanations import explain_if_configured
from chart.inference.providers.lbw_r import (
    LbwProviderError,
    call_association_r,
    call_lbw_r,
)
from chart.inference.providers.openai_compatible import configured_explainer


MODEL_RELEASE_ID = "lbw-test-1.0.0"
MODEL_FILE = "state.rds"
MODEL_VERSION = "1.0.0"
MODEL_SHA256 = "a" * 64


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
            model_release_id=MODEL_RELEASE_ID,
            model_file=MODEL_FILE,
            model_version=MODEL_VERSION,
            model_sha256=MODEL_SHA256,
            model_area="Madhya Pradesh",
            pregnancy_window=1,
            temperatures_c=(31.0, 30.0, 29.0),
        )

    sent = json.loads(urlopen.call_args.args[0].data.decode("utf-8"))
    assert sent["tmax_lag"] == [31.0, 30.0, 29.0]
    assert sent["release_id"] == MODEL_RELEASE_ID
    assert sent["model_file"] == MODEL_FILE
    assert sent["model_version"] == MODEL_VERSION
    assert sent["model_sha256"] == MODEL_SHA256
    assert "tmax" not in sent
    # No editorial reference passed → provider does not send ``ref``, so the
    # R runtime uses the per-block MMT baked into the compact ``.rds``.
    assert "ref" not in sent
    assert result["odds_ratio"] == 1.12


def test_lbw_provider_forwards_editorial_reference_to_r_runtime() -> None:
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
        call_lbw_r(
            "http://lbw.test",
            model_release_id=MODEL_RELEASE_ID,
            model_file=MODEL_FILE,
            model_version=MODEL_VERSION,
            model_sha256=MODEL_SHA256,
            model_area="Madhya Pradesh",
            pregnancy_window=1,
            temperatures_c=(31.0, 30.0, 29.0),
            reference_temperature_c=27.0,
        )

    sent = json.loads(urlopen.call_args.args[0].data.decode("utf-8"))
    assert sent["ref"] == 27.0


def test_association_provider_and_gateway_preserve_four_day_profile() -> None:
    response = {
        "model_release_id": "under5-review",
        "area": "Bhopal",
        "geography_level": "division",
        "outcome": "under_5_mortality",
        "exposure_values_c": [32.0, 32.0, 32.0, 32.0],
        "ref_temp": 30.11611,
        "effect_measure": "odds_ratio",
        "odds_ratio": 1.12,
        "ci95_low": 1.02,
        "ci95_high": 1.22,
        "on_training_support": True,
        "model_file": "under5.rds",
        "model_version": "0.1.0-review",
        "model_sha256": "b" * 64,
        "n_model_rows": 943,
        "n_training": 943,
        "n_events": 215,
        "n_subjects": 215,
        "modelled_temperature_range_c": [15.36, 45.77],
    }
    with patch("chart.inference.service.call_association_r", return_value=response):
        score = score_association(
            model_release_id="under5-review",
            model_file="under5.rds",
            model_version="0.1.0-review",
            model_sha256="b" * 64,
            model_area="Bhopal",
            outcome="under_5_mortality",
            exposure_values_c=(32.0, 32.0, 32.0, 32.0),
            service_url="http://model.test",
        )
    assert score.exposure_values_c == (32.0, 32.0, 32.0, 32.0)
    assert score.n_model_rows == 943
    assert score.n_training == 943
    assert score.n_events == 215
    assert score.n_subjects == 215


def test_association_provider_sends_outcome_and_generic_exposure() -> None:
    response = {
        "area": "Bhopal",
        "geography_level": "division",
        "outcome": "under_5_mortality",
        "exposure_values_c": [32.0, 32.0, 32.0, 32.0],
        "ref_temp": 30.0,
        "effect_measure": "odds_ratio",
        "odds_ratio": 1.1,
        "ci95_low": 1.0,
        "ci95_high": 1.2,
        "on_training_support": True,
        "model_file": "under5.rds",
        "model_version": "0.1.0-review",
        "model_sha256": "b" * 64,
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
        call_association_r(
            "http://model.test",
            model_release_id="under5-review",
            model_file="under5.rds",
            model_version="0.1.0-review",
            model_sha256="b" * 64,
            model_area="Bhopal",
            outcome="under_5_mortality",
            exposure_values_c=(32.0, 32.0, 32.0, 32.0),
        )
    sent = json.loads(urlopen.call_args.args[0].data.decode("utf-8"))
    assert sent["outcome"] == "under_5_mortality"
    assert sent["exposure_values_c"] == [32.0, 32.0, 32.0, 32.0]


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
            model_release_id=MODEL_RELEASE_ID,
            model_file=MODEL_FILE,
            model_version=MODEL_VERSION,
            model_sha256=MODEL_SHA256,
            model_area="Madhya Pradesh",
            pregnancy_window=1,
            temperatures_c=(31.0, 30.0, 29.0),
            service_url="http://lbw.test",
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
            model_release_id=MODEL_RELEASE_ID,
            model_file=MODEL_FILE,
            model_version=MODEL_VERSION,
            model_sha256=MODEL_SHA256,
            model_area="Madhya Pradesh",
            pregnancy_window=1,
            temperatures_c=(31.0, 30.0, 29.0),
            service_url="http://lbw.test",
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
            model_release_id=MODEL_RELEASE_ID,
            model_file=MODEL_FILE,
            model_version=MODEL_VERSION,
            model_sha256=MODEL_SHA256,
            model_area="Madhya Pradesh",
            pregnancy_window=1,
            temperatures_c=(31.0, 30.0, 29.0),
        )

    assert caught.value.code == "LBW_SERVICE_UNAVAILABLE"


def test_circuit_reopens_but_half_open_probe_can_close_it(monkeypatch) -> None:
    """After the wait window expires the next call runs as a probe. A
    successful probe closes the circuit end-to-end (counter resets); a
    failing probe re-opens the circuit for the same wait without
    carrying a stale counter that would immediately re-trip on the
    request after that."""

    from chart.inference.providers import lbw_r

    lbw_r.reset_circuit()
    monkeypatch.setenv("INFERENCE_LBW_CIRCUIT_FAILURES", "2")
    monkeypatch.setenv("INFERENCE_LBW_CIRCUIT_SECONDS", "1")
    monkeypatch.setenv("INFERENCE_LBW_ATTEMPTS", "1")

    # Two failures trip the breaker (threshold=2).
    with patch(
        "chart.inference.providers.lbw_r.urllib.request.urlopen",
        side_effect=urllib.error.URLError("down"),
    ):
        for _ in range(2):
            with pytest.raises(LbwProviderError):
                call_lbw_r(
                    "http://lbw.test",
                    model_release_id=MODEL_RELEASE_ID,
                    model_file=MODEL_FILE,
                    model_version=MODEL_VERSION,
                    model_sha256=MODEL_SHA256,
                    model_area="Madhya Pradesh",
                    pregnancy_window=1,
                    temperatures_c=(31.0, 30.0, 29.0),
                )
    # Circuit now open. Any call fails fast with LBW_CIRCUIT_OPEN.
    with pytest.raises(LbwProviderError) as fast_fail:
        call_lbw_r(
            "http://lbw.test",
            model_release_id=MODEL_RELEASE_ID,
            model_file=MODEL_FILE,
            model_version=MODEL_VERSION,
            model_sha256=MODEL_SHA256,
            model_area="Madhya Pradesh",
            pregnancy_window=1,
            temperatures_c=(31.0, 30.0, 29.0),
        )
    assert fast_fail.value.code == "LBW_CIRCUIT_OPEN"

    # Sleep past the 1 s wait, then land a probe. A successful probe
    # should close the circuit.
    import time as _time

    _time.sleep(1.1)
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
    ):
        result = call_lbw_r(
            "http://lbw.test",
            model_release_id=MODEL_RELEASE_ID,
            model_file=MODEL_FILE,
            model_version=MODEL_VERSION,
            model_sha256=MODEL_SHA256,
            model_area="Madhya Pradesh",
            pregnancy_window=1,
            temperatures_c=(31.0, 30.0, 29.0),
        )
    assert result["odds_ratio"] == 1.12
    # Cleanup — release module state for adjacent tests.
    lbw_r.reset_circuit()


def test_reset_circuit_clears_state(monkeypatch) -> None:
    from chart.inference.providers import lbw_r

    monkeypatch.setenv("INFERENCE_LBW_CIRCUIT_FAILURES", "1")
    monkeypatch.setenv("INFERENCE_LBW_ATTEMPTS", "1")
    lbw_r.reset_circuit()
    with patch(
        "chart.inference.providers.lbw_r.urllib.request.urlopen",
        side_effect=urllib.error.URLError("down"),
    ):
        with pytest.raises(LbwProviderError):
            call_lbw_r(
                "http://lbw.test",
                model_release_id=MODEL_RELEASE_ID,
                model_file=MODEL_FILE,
                model_version=MODEL_VERSION,
                model_sha256=MODEL_SHA256,
                model_area="Madhya Pradesh",
                pregnancy_window=1,
                temperatures_c=(31.0, 30.0, 29.0),
            )
    # Circuit is now open — confirm the fast-fail path.
    with pytest.raises(LbwProviderError) as blocked:
        call_lbw_r(
            "http://lbw.test",
            model_release_id=MODEL_RELEASE_ID,
            model_file=MODEL_FILE,
            model_version=MODEL_VERSION,
            model_sha256=MODEL_SHA256,
            model_area="Madhya Pradesh",
            pregnancy_window=1,
            temperatures_c=(31.0, 30.0, 29.0),
        )
    assert blocked.value.code == "LBW_CIRCUIT_OPEN"
    # Explicit reset — next call should attempt R again (and fail
    # because R is still mocked-down, but with a different error code).
    lbw_r.reset_circuit()
    with patch(
        "chart.inference.providers.lbw_r.urllib.request.urlopen",
        side_effect=urllib.error.URLError("still down"),
    ):
        with pytest.raises(LbwProviderError) as after_reset:
            call_lbw_r(
                "http://lbw.test",
                model_release_id=MODEL_RELEASE_ID,
                model_file=MODEL_FILE,
                model_version=MODEL_VERSION,
                model_sha256=MODEL_SHA256,
                model_area="Madhya Pradesh",
                pregnancy_window=1,
                temperatures_c=(31.0, 30.0, 29.0),
            )
    assert after_reset.value.code == "LBW_SERVICE_UNAVAILABLE"
    lbw_r.reset_circuit()
