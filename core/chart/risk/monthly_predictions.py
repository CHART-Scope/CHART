"""Monthly dashboard bridge for stored model predictions.

Reads ``prediction_result`` - the durable, shared record of what a model said
about a place and a month - rather than reconstructing it from completed
request payloads.

The previous version selected every completed request for one user and sifted
it through nine guards in Python, because the fields that identify a
prediction lived inside a JSON column. That made the dashboard's cost grow
with a user's request history, and it scoped results to whoever happened to
run them: a month computed by one planner was invisible to the next, who
would recompute it and re-pull the observations. Both problems were the same
problem - the grain existed only in Python - so the fix is a table keyed on
that grain and a query against it.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from chart.shared.db.models import DataLabel, PredictionResult
from chart.shared.outcomes import DEFAULT_OUTCOME

from .schemas import MonthlyPrediction

#: The dashboard's monthly card reports the single-month horizon against
#: observed data. Other horizons belong to the short-term and long-term views.
MONTHLY_HORIZON = "m1"
OBSERVED_SCENARIO = "seas5_ensemble"
#: The card reports the final pregnancy window, or a model that has none.
#: ``0`` is the stored "not applicable" (under five); other windows are real
#: predictions that simply belong to a different view.
MONTHLY_PREGNANCY_WINDOWS = (0, 1)


def load_monthly_predictions(
    session: Session,
    admin_unit_id: int,
    user_id: str | None,
    month: str | None,
    outcome: str = DEFAULT_OUTCOME,
) -> dict[str, MonthlyPrediction]:
    """Stored predictions for one place and outcome, keyed ``YYYY-MM``.

    ``user_id`` is accepted and ignored. A prediction is a statement about a
    place and a month, not about who asked for it, so every authorised reader
    of a place sees the same results. The parameter stays so call sites and
    their tests need not change in the same step.
    """

    query = select(PredictionResult).where(
        PredictionResult.admin_unit_id == admin_unit_id,
        PredictionResult.outcome == outcome,
        PredictionResult.horizon == MONTHLY_HORIZON,
        PredictionResult.scenario == OBSERVED_SCENARIO,
        # Observed months only. A result built on seasonal forecast, a
        # projection, or sample data is a real prediction, but it is not the
        # observed month this card reports.
        PredictionResult.data_label == DataLabel.reanalysis,
        PredictionResult.pregnancy_window.in_(MONTHLY_PREGNANCY_WINDOWS),
    )
    if month is not None:
        query = query.where(
            PredictionResult.valid_month == _first_of_month(month),
        )
    # Newest computation wins where an older model release also covered the
    # month, so a re-released model supersedes rather than duplicates.
    query = query.order_by(
        PredictionResult.valid_month,
        PredictionResult.computed_at.desc(),
        PredictionResult.id.desc(),
    )

    estimates: dict[str, MonthlyPrediction] = {}
    for row in session.scalars(query):
        key = row.valid_month.strftime("%Y-%m")
        if key in estimates:
            continue
        estimates[key] = MonthlyPrediction(
            request_id=row.prediction_request_id or 0,
            attributable_fraction_milli=row.attributable_fraction_milli,
            odds_ratio=row.odds_ratio,
            reference_temperature_c=row.reference_temperature_c,
            reference_kind=row.reference_kind,
            ci95_low=row.ci95_low,
            ci95_high=row.ci95_high,
            on_training_support=row.on_training_support,
            warning=row.warning,
            model_version=row.model_version,
            exposure_temperatures_c=list(row.exposure_values_c or []),
            exposure_dates=[_as_date(value) for value in (row.exposure_dates or [])],
        )
    return estimates


def _first_of_month(month: str) -> date:
    year, month_number = month.split("-")
    return date(int(year), int(month_number), 1)


def _as_date(value) -> date:
    return value if isinstance(value, date) else date.fromisoformat(str(value))
