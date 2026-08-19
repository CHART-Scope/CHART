"""On-demand LBW scoring for the dashboard's temperature slider.

This is the *slider* orchestrator around the DLNM R model. It shares one
primitive with the batch pipeline — ``chart.inference.score_lbw`` — but
skips the DB persistence, climate ingest, and Dagster orchestration that
``score_prepared_prediction`` needs. Keeping the two paths in separate
modules makes the isolation explicit: batch reads the world; slider does
not.
"""

from __future__ import annotations

import logging

from chart.inference import InferenceError
from chart.shared.db.session import get_session_factory

from .schemas import PregnancyWindow, WhatIfResponse
from .model_scoring import score_association_model, score_lbw_model
from .service import ClimateServiceError, _resolve_place


logger = logging.getLogger(__name__)


# Window 1 == final (third) trimester in this codebase; see the comment on
# ``PredictRequest.pregnancy_windows``. The dashboard's headline prediction
# uses the same window, so the slider % is directly comparable.
_WHAT_IF_PREGNANCY_WINDOW: PregnancyWindow = 1


def score_what_if(
    *,
    geography_id: str,
    temperature_c: float,
    outcome: str = "lbw",
    session_factory=None,
    lbw_service_url: str | None = None,
) -> WhatIfResponse:
    session_factory = session_factory or get_session_factory()
    with session_factory() as session:
        place = _resolve_place(session, geography_id, outcome=outcome)
        if place.model is None:
            raise ClimateServiceError("MODEL_NOT_AVAILABLE_FOR_PLACE", 409)
        if outcome != "lbw":
            return _score_association_what_if(
                geography_id=geography_id,
                temperature_c=temperature_c,
                outcome=outcome,
                model=place.model,
                service_url=lbw_service_url,
            )
        window = _WHAT_IF_PREGNANCY_WINDOW
        if window not in place.model.validated_pregnancy_windows:
            raise ClimateServiceError("MODEL_PREGNANCY_WINDOW_NOT_VALIDATED", 409)
        model_release_id = place.model.release_id
        model_file = place.model.model_file
        model_version = place.model.version

    temperature = float(temperature_c)
    temperatures = (temperature, temperature, temperature)
    try:
        score = score_lbw_model(
            place.model,
            pregnancy_window=window,
            temperatures_c=temperatures,
            service_url=lbw_service_url,
        )
    except InferenceError as error:
        unavailable = {
            "LBW_SERVICE_NOT_CONFIGURED",
            "LBW_SERVICE_TIMEOUT",
            "LBW_SERVICE_UNAVAILABLE",
            "LBW_CIRCUIT_OPEN",
            "MODEL_RUNTIME_NOT_CONFIGURED",
            "MODEL_RUNTIME_UNAVAILABLE",
            "MODEL_RELEASE_FILE_MISSING",
        }
        status = 503 if error.code in unavailable else 502
        logger.warning(
            "what-if LBW inference failed: code=%s status=%s detail=%s "
            "release=%s file=%s version=%s",
            error.code,
            status,
            error.detail,
            model_release_id,
            model_file,
            model_version,
        )
        raise ClimateServiceError(error.code, status, error.detail) from error

    return WhatIfResponse(
        geography_id=geography_id,
        temperature_c=temperature,
        outcome="lbw",
        area=score.area,
        geography_level=score.geography_level,
        pregnancy_window=window,
        exposure_values_c=list(score.temperatures_c),
        tmax_lag=list(score.temperatures_c),
        reference_temperature_c=score.reference_temperature_c,
        effect_measure="odds_ratio",
        odds_ratio=score.odds_ratio,
        ci95_low=score.ci95_low,
        ci95_high=score.ci95_high,
        attributable_fraction_percent=_odds_ratio_to_percent(score.odds_ratio),
        relative_odds_change_percent=_relative_odds_change_percent(score.odds_ratio),
        on_training_support=score.on_training_support,
        warning=score.warning,
        n_training=score.n_training,
        modelled_temperature_range_c=(
            list(score.modelled_temperature_range_c)
            if score.modelled_temperature_range_c is not None
            else None
        ),
        model_version=model_version,
        **_presentation_fields(place.model.input_spec),
    )


def _score_association_what_if(
    *,
    geography_id: str,
    temperature_c: float,
    outcome: str,
    model,
    service_url: str | None,
) -> WhatIfResponse:
    contract = (model.input_spec or {}).get("input_contract") or {}
    variables = contract.get("variables") or []
    length = variables[0].get("length") if len(variables) == 1 else None
    if not isinstance(length, int) or length < 1:
        raise ClimateServiceError("MODEL_INPUT_CONTRACT_INVALID", 409)
    if contract.get("interactive_profile") not in (
        None,
        "repeat_selected_temperature_across_all_lags",
    ):
        raise ClimateServiceError("MODEL_INTERACTIVE_PROFILE_UNSUPPORTED", 409)
    temperature = float(temperature_c)
    values = tuple(temperature for _ in range(length))
    try:
        score = score_association_model(
            model,
            outcome=outcome,
            exposure_values_c=values,
            service_url=service_url,
        )
    except InferenceError as error:
        unavailable = {
            "MODEL_RUNTIME_NOT_CONFIGURED",
            "MODEL_RUNTIME_UNAVAILABLE",
            "MODEL_RELEASE_FILE_MISSING",
        }
        status = (
            503
            if "SERVICE" in error.code
            or "CIRCUIT" in error.code
            or error.code in unavailable
            else 502
        )
        logger.warning(
            "what-if association inference failed: code=%s status=%s detail=%s "
            "release=%s file=%s version=%s",
            error.code,
            status,
            error.detail,
            model.release_id,
            model.model_file,
            model.version,
        )
        raise ClimateServiceError(error.code, status, error.detail) from error
    return WhatIfResponse(
        geography_id=geography_id,
        temperature_c=temperature,
        outcome=outcome,
        area=score.area,
        geography_level=score.geography_level,
        exposure_values_c=list(score.exposure_values_c),
        tmax_lag=list(score.exposure_values_c),
        reference_temperature_c=score.reference_temperature_c,
        effect_measure=score.effect_measure,
        odds_ratio=score.estimate,
        ci95_low=score.ci95_low,
        ci95_high=score.ci95_high,
        attributable_fraction_percent=_odds_ratio_to_percent(score.estimate),
        relative_odds_change_percent=_relative_odds_change_percent(score.estimate),
        on_training_support=score.on_training_support,
        warning=score.warning,
        n_model_rows=score.n_model_rows,
        n_training=score.n_training,
        n_events=score.n_events,
        n_subjects=score.n_subjects,
        modelled_temperature_range_c=(
            list(score.modelled_temperature_range_c)
            if score.modelled_temperature_range_c is not None
            else None
        ),
        model_version=score.model_version,
        **_presentation_fields(model.input_spec),
    )


def _presentation_fields(input_spec: dict | None) -> dict:
    presentation = (input_spec or {}).get("presentation") or {}
    return {
        "climate_hazard_label": presentation.get("climate_hazard_label"),
        "health_domain_label": presentation.get("health_domain_label"),
        "outcome_label": presentation.get("outcome_label"),
        "dashboard_title": presentation.get("dashboard_title"),
        "population_label": presentation.get("population_label"),
    }


def _odds_ratio_to_percent(odds_ratio: float) -> float:
    # Textbook OR -> AF for a rare outcome (matches health_impact/derivation.py).
    # Rounded to 0.1% so a small slider nudge does not flicker the display.
    if odds_ratio <= 1:
        return 0.0
    fraction = (odds_ratio - 1) / odds_ratio
    return round(max(0.0, min(1.0, fraction)) * 1000) / 10


def _relative_odds_change_percent(odds_ratio: float) -> float:
    """Signed percentage change in modelled odds relative to the reference."""

    return round((odds_ratio - 1) * 1000) / 10
