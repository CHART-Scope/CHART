"""Turn a completed prediction into the durable, shared result row.

One place derives a ``prediction_result`` from a ``PredictResponse``, and both
the completion path and the migration backfill go through it. That matters
because the two must agree: a backfilled month and a freshly computed one
should be indistinguishable, and the stored attributable fraction has to equal
the one the dashboard renders.

That last point is the reason this module exists rather than reusing
``health_impact.materialize``: that bridge calls
``attributable_fraction_milli`` with the odds ratio alone, so the
below-reference clamp never applies, while the dashboard's read path passes
the temperature and the reference and does clamp. Two formulas for one number
is a disagreement waiting to surface, so here the clamped form is the only
form.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from chart.health_impact.derivation import attributable_fraction_milli
from chart.health_impact.materialize import (
    PLANNING_TARGET_TO_HORIZON,
    _resolve_scenario_label,
)
from chart.shared.db.models import DataLabel, PredictionResult

from .input_windows import target_months
from .schemas import PredictResponse


def resolve_horizon(planning_target: str) -> str:
    return PLANNING_TARGET_TO_HORIZON.get(planning_target, "m1")


def climate_data_label(result: PredictResponse) -> DataLabel:
    """What kind of data this prediction actually stands on.

    Derived from the climate months that were scored, not from whether a
    projection scenario was asked for. A month built from seasonal forecast or
    sample data is not an observed month, and the monthly dashboard card shows
    observed months only - so the distinction has to survive into the row
    rather than being re-derived from the request later.
    """
    labels = {item.data_label for item in result.climate}
    sources = {item.source_class for item in result.climate}
    if "sample" in labels:
        return DataLabel.sample
    if "projection" in sources:
        return DataLabel.projection
    if "seasonal" in sources or "forecast" in labels:
        return DataLabel.forecast
    return DataLabel.reanalysis


def integrity_problem(
    result: PredictResponse,
    *,
    geography_id: str | None,
    valid_month: date,
) -> str | None:
    """Why this result must not be stored, or None if it is sound.

    These were read-time guards. Checking them once on the way in is both
    cheaper and stricter: a result that fails here is not a row the dashboard
    should quietly skip, it is a result that disagrees with the request that
    produced it, and storing it would leave the disagreement in the database.
    """
    if geography_id and result.place.geography_id != geography_id:
        return (
            f"place mismatch: result says {result.place.geography_id}, "
            f"request says {geography_id}"
        )
    expected = {value.strftime("%Y-%m") for value in target_months(valid_month)}
    actual = {item.month for item in result.climate}
    if actual != expected:
        return f"climate window {sorted(actual)} is not {sorted(expected)}"
    return None


def selected_exposure_c(result: PredictResponse, valid_month: date) -> float | None:
    """The exposure for the month being reported, at lag 0 of the model's window.

    Needed so a cooler-than-reference month cannot report a heat-attributable
    share. Matches how the dashboard's read path picks it.
    """
    key = valid_month.strftime("%Y-%m")
    return next(
        (item.temperature_c for item in result.climate if item.month == key),
        None,
    )


def upsert_prediction_result(
    session: Session,
    *,
    result: PredictResponse,
    admin_unit_id: int,
    outcome: str,
    model_release_id: str,
    valid_month: date,
    model_artifact_sha256: str | None = None,
    reference_kind: str | None = None,
    input_statistic: str | None = None,
    climate_input_window_id: int | None = None,
    prediction_request_id: int | None = None,
) -> PredictionResult:
    """Write one result on its grain, replacing any earlier value for it.

    Upsert rather than insert: recomputing a month should correct the row
    rather than accumulate a second opinion beside it.
    """
    prediction = result.prediction
    month_start = valid_month.replace(day=1)
    scenario = _resolve_scenario_label(result.projection_scenario)
    horizon = resolve_horizon(result.planning_target)
    # 0 rather than NULL for a model with no pregnancy window, so the grain
    # constrains those rows instead of letting NULLs multiply.
    window = prediction.pregnancy_window or 0

    fraction_milli = attributable_fraction_milli(
        prediction.odds_ratio,
        temperature_c=selected_exposure_c(result, month_start),
        reference_temperature_c=prediction.reference_temperature_c,
    )

    values = {
        "odds_ratio": prediction.odds_ratio,
        "ci95_low": prediction.ci95_low,
        "ci95_high": prediction.ci95_high,
        "attributable_fraction_milli": fraction_milli,
        "reference_temperature_c": prediction.reference_temperature_c,
        "reference_kind": reference_kind,
        "on_training_support": prediction.on_training_support,
        "warning": prediction.warning,
        "model_version": prediction.model_version,
        "model_artifact_sha256": model_artifact_sha256 or prediction.model_sha256,
        "exposure_values_c": list(prediction.temperatures_c),
        "exposure_dates": [
            value.isoformat() for value in (prediction.exposure_dates or [])
        ],
        "data_label": climate_data_label(result),
        "input_statistic": input_statistic,
        "climate_input_window_id": climate_input_window_id,
        "prediction_request_id": prediction_request_id,
    }

    existing = session.scalar(
        select(PredictionResult).where(
            PredictionResult.admin_unit_id == admin_unit_id,
            PredictionResult.outcome == outcome,
            PredictionResult.model_release_id == model_release_id,
            PredictionResult.valid_month == month_start,
            PredictionResult.scenario == scenario,
            PredictionResult.horizon == horizon,
            PredictionResult.pregnancy_window == window,
        )
    )
    if existing is not None:
        for field, value in values.items():
            setattr(existing, field, value)
        session.flush()
        return existing

    row = PredictionResult(
        admin_unit_id=admin_unit_id,
        outcome=outcome,
        model_release_id=model_release_id,
        valid_month=month_start,
        scenario=scenario,
        horizon=horizon,
        pregnancy_window=window,
        **values,
    )
    session.add(row)
    session.flush()
    return row
