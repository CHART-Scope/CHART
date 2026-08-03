"""On-demand LBW scoring for the dashboard's temperature slider.

This is the *slider* orchestrator around the DLNM R model. It shares one
primitive with the batch pipeline — ``chart.inference.score_lbw`` — but
skips the DB persistence, climate ingest, and Dagster orchestration that
``score_prepared_prediction`` needs. Keeping the two paths in separate
modules makes the isolation explicit: batch reads the world; slider does
not.
"""

from __future__ import annotations

from chart.inference import InferenceError, score_lbw
from chart.shared.db.session import get_session_factory

from .schemas import PregnancyWindow, WhatIfResponse
from .service import ClimateServiceError, _resolve_place


# Window 1 == final (third) trimester in this codebase; see the comment on
# ``PredictRequest.pregnancy_windows``. The dashboard's headline prediction
# uses the same window, so the slider % is directly comparable.
_WHAT_IF_PREGNANCY_WINDOW: PregnancyWindow = 1


def score_what_if(
    *,
    geography_id: str,
    temperature_c: float,
    session_factory=None,
    lbw_service_url: str | None = None,
) -> WhatIfResponse:
    session_factory = session_factory or get_session_factory()
    with session_factory() as session:
        place = _resolve_place(session, geography_id)
        if place.model is None:
            raise ClimateServiceError("MODEL_NOT_AVAILABLE_FOR_PLACE", 409)
        window = _WHAT_IF_PREGNANCY_WINDOW
        if window not in place.model.validated_pregnancy_windows:
            raise ClimateServiceError("MODEL_PREGNANCY_WINDOW_NOT_VALIDATED", 409)
        model_area_name = place.model.model_area_name
        model_version = place.model.version
        model_sha256 = place.model.artifact_sha256

    temperature = float(temperature_c)
    temperatures = (temperature, temperature, temperature)
    try:
        score = score_lbw(
            model_area=model_area_name,
            pregnancy_window=window,
            temperatures_c=temperatures,
            service_url=lbw_service_url,
            expected_model_version=model_version,
            expected_model_sha256=model_sha256,
        )
    except InferenceError as error:
        unavailable = {
            "LBW_SERVICE_NOT_CONFIGURED",
            "LBW_SERVICE_TIMEOUT",
            "LBW_SERVICE_UNAVAILABLE",
            "LBW_CIRCUIT_OPEN",
        }
        status = 503 if error.code in unavailable else 502
        raise ClimateServiceError(error.code, status, error.detail) from error

    return WhatIfResponse(
        geography_id=geography_id,
        temperature_c=temperature,
        area=score.area,
        geography_level=score.geography_level,
        pregnancy_window=window,
        tmax_lag=list(score.temperatures_c),
        reference_temperature_c=score.reference_temperature_c,
        odds_ratio=score.odds_ratio,
        ci95_low=score.ci95_low,
        ci95_high=score.ci95_high,
        attributable_fraction_percent=_odds_ratio_to_percent(score.odds_ratio),
        on_training_support=score.on_training_support,
        warning=score.warning,
        n_training=score.n_training,
        modelled_temperature_range_c=(
            list(score.modelled_temperature_range_c)
            if score.modelled_temperature_range_c is not None
            else None
        ),
        model_version=model_version,
    )


def _odds_ratio_to_percent(odds_ratio: float) -> float:
    # Textbook OR -> AF for a rare outcome (matches health_impact/derivation.py).
    # Rounded to 0.1% so a small slider nudge does not flicker the display.
    if odds_ratio <= 1:
        return 0.0
    fraction = (odds_ratio - 1) / odds_ratio
    return round(max(0.0, min(1.0, fraction)) * 1000) / 10
