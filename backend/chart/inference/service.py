from __future__ import annotations

import os
import math
from dataclasses import dataclass
from typing import Literal, cast

from .providers.lbw_r import LbwProviderError, call_lbw_r

PregnancyWindow = Literal[1, 2, 3]


class InferenceError(RuntimeError):
    def __init__(self, code: str, detail: str = "") -> None:
        super().__init__(f"{code}: {detail}" if detail else code)
        self.code = code
        self.detail = detail


@dataclass(frozen=True)
class LbwScore:
    area: str
    geography_level: str
    pregnancy_window: PregnancyWindow
    temperatures_c: tuple[float, float, float]
    reference_temperature_c: float
    odds_ratio: float
    ci95_low: float
    ci95_high: float
    on_training_support: bool
    model_file: str
    model_version: str | None
    model_sha256: str
    warning: str | None


def score_lbw(
    *,
    model_area: str,
    pregnancy_window: PregnancyWindow,
    temperatures_c: tuple[float, float, float],
    service_url: str | None = None,
    expected_model_version: str | None = None,
    expected_model_sha256: str | None = None,
) -> LbwScore:
    """Run the deterministic LBW scorer; explanations are a separate concern."""

    provider = os.getenv("INFERENCE_STATISTICAL_PROVIDER", "lbw_r")
    if provider != "lbw_r":
        raise InferenceError("STATISTICAL_PROVIDER_NOT_SUPPORTED", provider)
    url = (
        service_url
        if service_url is not None
        else os.getenv("INFERENCE_LBW_BASE_URL", os.getenv("LBW_SERVICE_URL", ""))
    )
    if not url:
        raise InferenceError("LBW_SERVICE_NOT_CONFIGURED")
    try:
        payload = call_lbw_r(
            url,
            model_area=model_area,
            pregnancy_window=pregnancy_window,
            temperatures_c=temperatures_c,
        )
    except LbwProviderError as error:
        raise InferenceError(error.code, error.detail) from error

    try:
        raw_temperatures = tuple(float(value) for value in payload["tmax_lag"])
        response_area = str(payload["area"])
        geography_level = str(payload["geography_level"])
        response_window = int(payload.get("trimester", pregnancy_window))
        reference_temperature = float(payload["ref_temp"])
        odds_ratio = float(payload["odds_ratio"])
        ci95_low = float(payload["ci95_low"])
        ci95_high = float(payload["ci95_high"])
        model_file = str(payload["model_file"])
        model_version = (
            str(payload["model_version"]) if payload.get("model_version") else None
        )
        model_sha256 = str(payload["model_sha256"])
    except (KeyError, TypeError, ValueError) as error:
        raise InferenceError("LBW_RESPONSE_INVALID", str(error)) from error

    if len(raw_temperatures) != 3:
        raise InferenceError(
            "LBW_RESPONSE_INVALID", "tmax_lag must contain exactly three values"
        )
    if response_window not in (1, 2, 3):
        raise InferenceError("LBW_RESPONSE_INVALID", "trimester must be 1, 2, or 3")
    validated_response_window = cast(PregnancyWindow, response_window)
    response_temperatures = (
        raw_temperatures[0],
        raw_temperatures[1],
        raw_temperatures[2],
    )
    numeric_values = (
        *response_temperatures,
        reference_temperature,
        odds_ratio,
        ci95_low,
        ci95_high,
    )
    if not all(math.isfinite(value) for value in numeric_values):
        raise InferenceError("LBW_RESPONSE_INVALID", "numeric values must be finite")
    if response_temperatures != temperatures_c:
        raise InferenceError(
            "LBW_RESPONSE_INPUT_MISMATCH", "the scorer did not echo exact inputs"
        )
    if validated_response_window != pregnancy_window:
        raise InferenceError("LBW_RESPONSE_INPUT_MISMATCH", "pregnancy window changed")
    if odds_ratio <= 0 or ci95_low <= 0 or ci95_high <= 0:
        raise InferenceError(
            "LBW_RESPONSE_INVALID", "odds ratio and interval must be positive"
        )
    if not ci95_low <= odds_ratio <= ci95_high:
        raise InferenceError(
            "LBW_RESPONSE_INVALID", "confidence interval does not contain estimate"
        )
    if not response_area or not geography_level or not model_file:
        raise InferenceError(
            "LBW_RESPONSE_INVALID", "identity fields must be non-empty"
        )
    if not isinstance(payload.get("on_training_support"), bool):
        raise InferenceError(
            "LBW_RESPONSE_INVALID", "on_training_support must be boolean"
        )
    if len(model_sha256) != 64 or any(
        character not in "0123456789abcdef" for character in model_sha256.lower()
    ):
        raise InferenceError("LBW_RESPONSE_INVALID", "model_sha256 is invalid")
    if expected_model_version is not None and model_version != expected_model_version:
        raise InferenceError("LBW_MODEL_VERSION_MISMATCH")
    if (
        expected_model_sha256 is not None
        and model_sha256.lower() != expected_model_sha256.lower()
    ):
        raise InferenceError("LBW_MODEL_CHECKSUM_MISMATCH")

    return LbwScore(
        area=response_area,
        geography_level=geography_level,
        pregnancy_window=validated_response_window,
        temperatures_c=response_temperatures,
        reference_temperature_c=reference_temperature,
        odds_ratio=odds_ratio,
        ci95_low=ci95_low,
        ci95_high=ci95_high,
        on_training_support=payload["on_training_support"],
        model_file=model_file,
        model_version=model_version,
        model_sha256=model_sha256.lower(),
        warning=str(payload["warning"]) if payload.get("warning") else None,
    )
