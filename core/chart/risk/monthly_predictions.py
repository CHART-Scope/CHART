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

import os
from datetime import date

from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from chart.model_registry.runtime import locate_model_artifact, model_cache_dir
from chart.model_registry.service import ModelRegistryError, release_base_uri
from chart.shared.db.models import (
    DataLabel,
    ModelAreaMapping,
    ModelRelease,
    PredictionResult,
)
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

    query = (
        select(
            PredictionResult,
            ModelAreaMapping.model_file,
            ModelRelease.release_file_uri,
        )
        .join(ModelRelease, ModelRelease.id == PredictionResult.model_release_id)
        .outerjoin(
            ModelAreaMapping,
            and_(
                ModelAreaMapping.model_release_id == PredictionResult.model_release_id,
                ModelAreaMapping.admin_unit_id == PredictionResult.admin_unit_id,
            ),
        )
        .where(
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
    for row, model_file, release_file_uri in session.execute(query):
        key = row.valid_month.strftime("%Y-%m")
        if key in estimates:
            continue
        artifact_uri = _artifact_uri(release_file_uri, model_file)
        estimates[key] = MonthlyPrediction(
            request_id=row.prediction_request_id or 0,
            model_release_id=row.model_release_id,
            model_file=model_file,
            model_artifact_sha256=row.model_artifact_sha256,
            model_artifact_uri=artifact_uri,
            model_runtime_path=_verified_runtime_path(
                model_file, row.model_artifact_sha256
            ),
            n_training=row.n_training,
            n_events=row.n_events,
            n_subjects=row.n_subjects,
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


def _artifact_uri(release_file_uri: str | None, model_file: str | None) -> str | None:
    base_uri = release_base_uri(release_file_uri)
    return f"{base_uri}/{model_file}" if base_uri and model_file else None


# Successful checks only: a missing artifact may be synced later, and hashing a
# multi-MB file on every dashboard read is what this cache avoids.
_verified_paths: dict[tuple[str, str, str], str] = {}


def _verified_runtime_path(
    model_file: str | None, artifact_sha256: str | None
) -> str | None:
    """Absolute path of the local artifact that scored the prediction.

    Only for local development (``CHART_SHOW_LOCAL_MODEL_PATH=1``), where the
    file on disk is the thing to open. A deployment leaves it unset and the
    dashboard links the published S3 artifact instead, so the server's
    filesystem layout never reaches the browser.
    """
    if os.getenv("CHART_SHOW_LOCAL_MODEL_PATH") != "1":
        return None
    if not model_file or not artifact_sha256:
        return None
    cache_root = model_cache_dir()
    key = (str(cache_root), model_file, artifact_sha256)
    if key not in _verified_paths:
        try:
            path = locate_model_artifact(model_file, artifact_sha256, cache_root)
        except ModelRegistryError:
            return None
        _verified_paths[key] = str(path)
    return _verified_paths[key]


def _first_of_month(month: str) -> date:
    year, month_number = month.split("-")
    return date(int(year), int(month_number), 1)


def _as_date(value) -> date:
    return value if isinstance(value, date) else date.fromisoformat(str(value))
