from __future__ import annotations

import json
import threading
from collections.abc import Callable
from typing import Literal, TypeVar, cast

from chart.inference import (
    AssociationScore,
    InferenceError,
    LbwScore,
    score_association,
    score_lbw,
)
from chart.model_registry.runtime import warm_model_artifact
from chart.model_registry.service import ActiveModelMapping, ModelRegistryError

Score = TypeVar("Score", LbwScore, AssociationScore)
_reload_lock = threading.Lock()


def score_lbw_model(
    model: ActiveModelMapping,
    *,
    pregnancy_window: int,
    temperatures_c: tuple[float, float, float],
    service_url: str | None = None,
) -> LbwScore:
    editorial_ref = _editorial_reference_temperature_c(model.input_spec)
    return _score_with_runtime_recovery(
        model,
        lambda: score_lbw(
            model_release_id=model.release_id,
            model_file=model.model_file,
            model_version=model.version,
            model_sha256=model.artifact_sha256,
            model_area=model.model_area_name,
            pregnancy_window=cast(Literal[1, 2, 3], pregnancy_window),
            temperatures_c=temperatures_c,
            service_url=service_url,
            reference_temperature_c=editorial_ref,
        ),
        service_url=service_url,
    )


def score_association_model(
    model: ActiveModelMapping,
    *,
    outcome: str,
    exposure_values_c: tuple[float, ...],
    service_url: str | None = None,
) -> AssociationScore:
    editorial_ref = _editorial_reference_temperature_c(model.input_spec)
    return _score_with_runtime_recovery(
        model,
        lambda: score_association(
            model_release_id=model.release_id,
            model_file=model.model_file,
            model_version=model.version,
            model_sha256=model.artifact_sha256,
            model_area=model.model_area_name,
            outcome=outcome,
            exposure_values_c=exposure_values_c,
            service_url=service_url,
            reference_temperature_c=editorial_ref,
        ),
        service_url=service_url,
    )


def _editorial_reference_temperature_c(input_spec: dict | None) -> float | None:
    """Return the manifest's editorial anchor if declared.

    Presentation-level override that re-anchors the DLNM crosspred in the
    R adapter so odds ratios and CIs match the paper's editorial reference
    instead of the per-block MMT baked into the ``.rds``.
    """

    presentation = (input_spec or {}).get("presentation") or {}
    value = presentation.get("editorial_reference_temperature_c")
    if value is None:
        return None
    return float(value)


def _score_with_runtime_recovery(
    model: ActiveModelMapping,
    score: Callable[[], Score],
    *,
    service_url: str | None,
) -> Score:
    try:
        return score()
    except InferenceError as error:
        if not _model_release_not_loaded(error):
            raise

    # Serialize the recovery so concurrent requests do not all hash and load
    # the same artifact after the R process restarts. Retry inside the lock in
    # case another request restored it while this request was waiting.
    with _reload_lock:
        try:
            return score()
        except InferenceError as error:
            if not _model_release_not_loaded(error):
                raise
        try:
            warm_model_artifact(
                release_id=model.release_id,
                model_version=model.version,
                model_file=model.model_file,
                model_sha256=model.artifact_sha256,
                service_url=service_url,
            )
        except ModelRegistryError as error:
            raise InferenceError(error.code, error.detail) from error
        return score()


def _model_release_not_loaded(error: InferenceError) -> bool:
    if error.code != "LBW_PREDICT_FAILED":
        return False
    try:
        detail = json.loads(error.detail)
    except (json.JSONDecodeError, TypeError):
        return False
    return detail.get("error") == "MODEL_RELEASE_NOT_LOADED"
