from __future__ import annotations

import hashlib
import json
import logging
import os
import secrets
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Literal, cast

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from chart.shared.outcomes import DEFAULT_OUTCOME
from chart.health_impact import (
    ErfParametersNotFound,
    MaterializationInput,
    materialize_health_impact,
)
from chart.inference import LbwScore
from chart.inference.explanations import explain_if_configured
from chart.model_registry.service import get_model_mapping, get_model_mappings
from chart.shared.db.models import (
    AdminUnit,
    ClimateInputMonthRecord,
    ClimateInputWindowRecord,
    DistrictClimate,
    PredictionRequestRecord,
    PredictionResult,
)
from chart.shared.db.session import get_session_factory

from .daily_windows import build_and_persist_daily_input_window, daily_contract
from chart.health_impact.materialize import _resolve_scenario_label
from .prediction_results import (
    integrity_problem,
    resolve_horizon,
    upsert_prediction_result,
)
from .input_windows import ClimateInputError, build_and_persist_input_window
from .planning_targets import planning_options_for_place
from .schemas import (
    PredictRequest,
    PredictResponse,
    PredictionAcceptedResponse,
    PredictionRequestListResponse,
    PredictionRequestStatusResponse,
    PredictionRequestSummaryResponse,
    PredictionStage,
    PredictionStatus,
)
from .service import (
    ClimateServiceError,
    climate_for_request,
    score_prepared_prediction,
    validate_prediction_request,
)

PREDICTION_PIPELINE_VERSION = "planning-prediction-v5-planner-actions"
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class QueuedPredictionRequest:
    id: int
    geography_id: str
    admin_unit_id: int
    planning_date: date
    source_as_of: datetime
    attempt_count: int
    lease_token: str | None = None
    planning_target: str = "month"
    projection_scenario: str | None = None
    projection_period: str | None = None


def submit_prediction(
    request: PredictRequest,
    *,
    requested_by_user_id: str | None = None,
    session_factory=None,
    now: datetime | None = None,
) -> PredictResponse | PredictionAcceptedResponse:
    """Create one versioned request; data preparation happens in Dagster."""

    place = validate_prediction_request(request, session_factory=session_factory)
    assert place.model is not None
    unsupported_windows = sorted(
        set(request.selected_pregnancy_windows())
        - set(place.model.validated_pregnancy_windows)
    )
    if unsupported_windows:
        raise ClimateServiceError(
            "MODEL_PREGNANCY_WINDOW_NOT_VALIDATED",
            409,
            ",".join(str(window) for window in unsupported_windows),
        )
    session_factory = session_factory or get_session_factory()
    current_time = now or _now()
    source_as_of = current_time.date()
    available_from = _available_from(request, place, now=current_time)
    initial_status: PredictionStatus = (
        "waiting" if available_from is not None else "queued"
    )
    request_payload = {
        **request.model_dump(mode="json"),
        "source_as_of": source_as_of.isoformat(),
    }
    identity_request = dict(request_payload)
    if request.planning_target == "next_heat_season" and available_from is not None:
        # A saved future plan keeps one durable identity while it waits.
        identity_request.pop("source_as_of", None)
    identity = {
        "pipeline_version": PREDICTION_PIPELINE_VERSION,
        "request": identity_request,
        "admin_unit_id": place.admin_unit.id,
        "model_release_id": place.model.release_id,
        "requested_by_user_id": requested_by_user_id,
    }
    # A month this place already has a result for needs no second run. The
    # stored result is keyed on place, outcome, release, month, scenario and
    # horizon - not on who asked - so a colleague's computed month answers
    # instantly instead of queueing a fresh ERA5 pull.
    stored = _stored_result_for(
        session_factory,
        admin_unit_id=place.admin_unit.id,
        outcome=request.outcome,
        model_release_id=place.model.release_id,
        request=request,
    )
    if stored is not None:
        return stored

    # A run already under way for this place, month and outcome is the answer
    # to this request. `request_key` cannot express that: it deliberately
    # includes the requester and the submission date, so the same month asked
    # for by a colleague, or by the same person tomorrow, forked a second row
    # and a second ERA5 download. With a map that can ask for many areas at
    # once that turned into a queue the workers could not drain - requests
    # reserved, leases expired before they ran, and 92 of them failed as
    # PREDICTION_LEASE_EXPIRED without a single wasted duplicate ever being
    # needed.
    live = _live_request_for(
        session_factory,
        admin_unit_id=place.admin_unit.id,
        model_release_id=place.model.release_id,
        request=request,
    )
    if live is not None:
        return live

    record = _get_or_create_request(
        session_factory,
        request_key=_request_key(identity),
        request_payload=request_payload,
        request=request,
        admin_unit_id=place.admin_unit.id,
        model_release_id=place.model.release_id,
        model_artifact_sha256=place.model.artifact_sha256,
        requested_by_user_id=requested_by_user_id,
        available_from=available_from,
        initial_status=initial_status,
        source_as_of_at=current_time,
    )
    if record.status == "completed" and record.result_payload is not None:
        return PredictResponse.model_validate(record.result_payload)
    return _accepted(record)


def get_prediction_request(
    request_id: int,
    *,
    requested_by_user_id: str | None = None,
    session_factory=None,
) -> PredictionRequestStatusResponse:
    session_factory = session_factory or get_session_factory()
    with session_factory() as session:
        record = session.get(PredictionRequestRecord, request_id)
        if record is None:
            raise ClimateServiceError("PREDICTION_REQUEST_NOT_FOUND", 404)
        if (
            requested_by_user_id is not None
            and record.requested_by_user_id != requested_by_user_id
        ):
            raise ClimateServiceError("PREDICTION_REQUEST_NOT_FOUND", 404)
        values = _record_values(record)
        validated_windows = _validated_windows_for_record(session, record)
    climate = climate_for_request(
        geography_id=values["geography_id"],
        planning_date=values["planning_date"],
        input_window_id=values["climate_input_window_id"],
        session_factory=session_factory,
        now=values["source_as_of"],
        projection_scenario=values["projection_scenario"],
        projection_period=values["projection_period"],
    )
    return _status_response(record, climate, validated_windows)


def list_prediction_requests(
    *,
    requested_by_user_id: str,
    geography_id: str,
    limit: int = 10,
    session_factory=None,
) -> PredictionRequestListResponse:
    """Return the signed-in user's durable recent runs for one place."""

    session_factory = session_factory or get_session_factory()
    with session_factory() as session:
        records = session.scalars(
            select(PredictionRequestRecord)
            .where(
                PredictionRequestRecord.requested_by_user_id == requested_by_user_id,
                PredictionRequestRecord.location_slug == geography_id,
            )
            .order_by(PredictionRequestRecord.created_at.desc())
            .limit(limit)
        ).all()
        mapping_keys = {
            (record.model_release_id, record.admin_unit_id)
            for record in records
            if record.model_release_id is not None and record.admin_unit_id is not None
        }
        mappings = get_model_mappings(session, mapping_keys)
        return PredictionRequestListResponse(
            items=[
                _summary_response(
                    record,
                    (
                        mappings[
                            (record.model_release_id, record.admin_unit_id)
                        ].validated_pregnancy_windows
                        if (
                            record.model_release_id,
                            record.admin_unit_id,
                        )
                        in mappings
                        else ()
                    ),
                )
                for record in records
            ]
        )


def list_queued_prediction_requests(
    *,
    session_factory=None,
    limit: int = 25,
) -> list[QueuedPredictionRequest]:
    session_factory = session_factory or get_session_factory()
    with session_factory() as session:
        records = session.scalars(
            select(PredictionRequestRecord)
            .where(PredictionRequestRecord.status == "queued")
            .where(PredictionRequestRecord.lease_token.is_(None))
            .order_by(PredictionRequestRecord.created_at.asc())
            .limit(limit)
        ).all()
        return [
            QueuedPredictionRequest(
                id=record.id,
                geography_id=record.request_payload["geography_id"],
                admin_unit_id=_required(record.admin_unit_id),
                planning_date=_planning_date(record),
                source_as_of=_source_as_of_datetime(record),
                attempt_count=record.attempt_count,
                planning_target=request.planning_target,
                projection_scenario=request.projection_scenario,
                projection_period=request.projection_period,
            )
            for record in records
            for request in [PredictRequest.model_validate(record.request_payload)]
        ]


def reserve_queued_prediction_requests(
    *,
    session_factory=None,
    limit: int = 25,
    owner: str = "dagster-sensor",
    now: datetime | None = None,
) -> list[QueuedPredictionRequest]:
    """Reserve queue entries before yielding deterministic Dagster run keys.

    Reserving first closes the crash window between sensor evaluation and the
    first job op. If Dagster never starts the run, the reservation expires and
    reconciliation emits a new attempt/run key.
    """

    session_factory = session_factory or get_session_factory()
    current_time = now or _now()
    reconcile_expired_prediction_requests(
        session_factory=session_factory, now=current_time
    )
    with session_factory() as session:
        records = session.scalars(
            select(PredictionRequestRecord)
            .where(
                PredictionRequestRecord.status == "queued",
                PredictionRequestRecord.lease_token.is_(None),
                (
                    PredictionRequestRecord.next_attempt_at.is_(None)
                    | (PredictionRequestRecord.next_attempt_at <= current_time)
                ),
            )
            .order_by(PredictionRequestRecord.created_at.asc())
            .limit(limit)
            .with_for_update(skip_locked=True)
        ).all()
        reserved: list[QueuedPredictionRequest] = []
        for record in records:
            token = secrets.token_hex(24)
            request = PredictRequest.model_validate(record.request_payload)
            record.lease_token = token
            record.lease_owner = owner
            record.lease_expires_at = current_time + _lease_duration()
            record.heartbeat_at = current_time
            record.next_attempt_at = None
            record.updated_at = current_time
            reserved.append(
                QueuedPredictionRequest(
                    id=record.id,
                    geography_id=request.geography_id,
                    admin_unit_id=_required(record.admin_unit_id),
                    planning_date=_planning_date(record),
                    source_as_of=_source_as_of_datetime(record),
                    attempt_count=record.attempt_count,
                    lease_token=token,
                    planning_target=request.planning_target,
                    projection_scenario=request.projection_scenario,
                    projection_period=request.projection_period,
                )
            )
        session.commit()
        return reserved


def reconcile_expired_prediction_requests(
    *,
    session_factory=None,
    now: datetime | None = None,
) -> int:
    """Recover work abandoned by a dead sensor, worker, or host."""

    session_factory = session_factory or get_session_factory()
    current_time = now or _now()
    max_attempts = int(os.getenv("PREDICTION_MAX_ATTEMPTS", "3"))
    with session_factory() as session:
        records = session.scalars(
            select(PredictionRequestRecord)
            .where(
                PredictionRequestRecord.status.in_(("queued", "running")),
                PredictionRequestRecord.lease_expires_at.is_not(None),
                PredictionRequestRecord.lease_expires_at <= current_time,
            )
            .with_for_update(skip_locked=True)
        ).all()
        for record in records:
            if record.attempt_count >= max_attempts:
                record.status = "failed"
                record.stage = "failed"
                record.error_code = "PREDICTION_LEASE_EXPIRED"
            else:
                record.status = "queued"
                record.stage = "queued"
                record.attempt_count += 1
                record.error_code = None
                record.next_attempt_at = current_time + timedelta(
                    seconds=min(300, 2**record.attempt_count)
                )
            _clear_lease(record)
            record.dagster_run_id = None
            record.updated_at = current_time
        session.commit()
        return len(records)


def activate_waiting_prediction_requests(
    *,
    session_factory=None,
    now: datetime | None = None,
) -> int:
    """Queue saved plans once their seasonal forecast can exist."""

    session_factory = session_factory or get_session_factory()
    current_date = (now or _now()).date()
    with session_factory() as session:
        records = session.scalars(
            select(PredictionRequestRecord)
            .where(
                PredictionRequestRecord.status == "waiting",
                PredictionRequestRecord.available_from.is_not(None),
                PredictionRequestRecord.available_from <= current_date,
            )
            .with_for_update()
        ).all()
        for record in records:
            payload = dict(record.request_payload)
            payload["source_as_of"] = current_date.isoformat()
            record.request_payload = payload
            record.status = "queued"
            record.stage = "queued"
            record.available_from = None
            record.source_as_of_at = now or _now()
            record.updated_at = _now()
        session.commit()
        return len(records)


def claim_prediction_request(
    request_id: int,
    *,
    dagster_run_id: str,
    lease_token: str,
    session_factory=None,
) -> bool:
    """Atomically claim a queued request before expensive work starts."""

    session_factory = session_factory or get_session_factory()
    with session_factory() as session:
        record = session.get(PredictionRequestRecord, request_id, with_for_update=True)
        if record is None:
            raise ClimateServiceError("PREDICTION_REQUEST_NOT_FOUND", 404)
        if record.status == "completed":
            return False
        if record.status not in {"queued", "running"}:
            return False
        if record.lease_token != lease_token:
            return False
        if record.lease_expires_at is None or _aware(record.lease_expires_at) <= _now():
            return False
        if record.status == "running" and record.dagster_run_id != dagster_run_id:
            return False
        record.status = "running"
        record.stage = "preparing_climate"
        record.dagster_run_id = dagster_run_id
        record.lease_owner = dagster_run_id
        record.lease_expires_at = _now() + _lease_duration()
        record.heartbeat_at = _now()
        record.error_code = None
        record.updated_at = _now()
        session.commit()
        return True


def mark_prediction_request_running(
    request_id: int,
    *,
    dagster_run_id: str,
    lease_token: str,
    session_factory=None,
) -> None:
    """Backward-compatible alias for callers moving to atomic claims."""

    claim_prediction_request(
        request_id,
        dagster_run_id=dagster_run_id,
        lease_token=lease_token,
        session_factory=session_factory,
    )


def set_prediction_request_stage(
    request_id: int,
    stage: PredictionStage,
    *,
    lease_token: str | None = None,
    session_factory=None,
) -> None:
    session_factory = session_factory or get_session_factory()
    with session_factory() as session:
        record = session.get(PredictionRequestRecord, request_id)
        if record is None:
            raise ClimateServiceError("PREDICTION_REQUEST_NOT_FOUND", 404)
        if record.status != "running" or not _owns_lease(record, lease_token):
            return
        record.stage = stage
        _extend_lease(record)
        record.updated_at = _now()
        session.commit()


def heartbeat_prediction_request(
    request_id: int,
    *,
    lease_token: str,
    session_factory=None,
) -> bool:
    session_factory = session_factory or get_session_factory()
    with session_factory() as session:
        record = session.get(PredictionRequestRecord, request_id, with_for_update=True)
        if (
            record is None
            or record.status != "running"
            or not _owns_lease(record, lease_token)
        ):
            return False
        _extend_lease(record)
        record.updated_at = _now()
        session.commit()
        return True


def prepare_prediction_input(
    request_id: int,
    *,
    live: bool,
    lease_token: str | None = None,
    session_factory=None,
    now: datetime | None = None,
) -> int:
    """Persist the three exact climate rows without contacting any model."""

    session_factory = session_factory or get_session_factory()
    with session_factory() as session:
        record = session.get(PredictionRequestRecord, request_id, with_for_update=True)
        if record is None:
            raise ClimateServiceError("PREDICTION_REQUEST_NOT_FOUND", 404)
        if not _owns_lease(record, lease_token):
            raise ClimateServiceError("PREDICTION_LEASE_LOST", 409)
        if record.climate_input_window_id is not None:
            return record.climate_input_window_id
        source_time = now or _source_as_of_datetime(record)
        request = PredictRequest.model_validate(record.request_payload)
        # Which grain this release reads decides which window is built. A
        # day-grain model scored against a month-grain window would be fed
        # three monthly means where it expects consecutive daily maxima.
        model = get_model_mapping(
            session,
            release_id=_required_text(record.model_release_id),
            admin_unit_id=_required(record.admin_unit_id),
        )
        try:
            daily = daily_contract(model.input_spec if model else None)
            if daily is not None:
                length, batch_profile = daily
                window = build_and_persist_daily_input_window(
                    session,
                    admin_unit_id=_required(record.admin_unit_id),
                    target_end_month=_planning_date(record),
                    length=length,
                    batch_profile=batch_profile,
                )
            else:
                window = build_and_persist_input_window(
                    session,
                    admin_unit_id=_required(record.admin_unit_id),
                    target_end_month=_planning_date(record),
                    live=live,
                    now=source_time,
                    projection_scenario=request.projection_scenario,
                    projection_period=request.projection_period,
                )
        except ClimateInputError as error:
            raise ClimateServiceError(error.code, 409, error.detail) from error
        record.climate_input_window_id = window.id
        record.stage = "climate_ready"
        if record.status == "running":
            _extend_lease(record)
        record.updated_at = _now()
        session.commit()
        return window.id


def complete_prediction_request(
    request_id: int,
    *,
    session_factory=None,
    lbw_service_url: str | None = None,
    lease_token: str | None = None,
) -> PredictResponse:
    """Score only a previously persisted climate input window."""

    session_factory = session_factory or get_session_factory()
    with session_factory() as session:
        record = session.get(PredictionRequestRecord, request_id, with_for_update=True)
        if record is None:
            raise ClimateServiceError("PREDICTION_REQUEST_NOT_FOUND", 404)
        if record.status == "completed" and record.result_payload is not None:
            return PredictResponse.model_validate(record.result_payload)
        if not _owns_lease(record, lease_token):
            raise ClimateServiceError("PREDICTION_LEASE_LOST", 409)
        if record.climate_input_window_id is None:
            raise ClimateServiceError("CLIMATE_DATA_NOT_READY", 409)
        record.stage = "predicting"
        if record.status == "running":
            _extend_lease(record)
        record.updated_at = _now()
        session.commit()

        request = PredictRequest.model_validate(record.request_payload)
        score_args = {
            "request_id": record.id,
            "geography_id": request.geography_id,
            "planning_date": request.planning_date,
            "admin_unit_id": _required(record.admin_unit_id),
            "climate_input_window_id": record.climate_input_window_id,
            "model_release_id": _required_text(record.model_release_id),
            "expected_model_sha256": _required_text(record.model_artifact_sha256),
            "source_as_of": _source_as_of_datetime(record),
            "lbw_service_url": lbw_service_url,
            "planning_target": request.planning_target,
            "projection_scenario": request.projection_scenario,
            "projection_period": request.projection_period,
        }
        pregnancy_windows = request.selected_pregnancy_windows()

    stage_results = [
        score_prepared_prediction(
            session_factory,
            pregnancy_window=pregnancy_window,
            **score_args,
        )
        for pregnancy_window in pregnancy_windows
    ]
    predictions = [item.prediction for item in stage_results]
    result = stage_results[0].model_copy(
        update={"prediction": predictions[0], "predictions": predictions}
    )

    with session_factory() as session:
        record = session.get(PredictionRequestRecord, request_id, with_for_update=True)
        if record is None:
            raise ClimateServiceError("PREDICTION_REQUEST_NOT_FOUND", 404)
        if record.status == "completed" and record.result_payload is not None:
            return PredictResponse.model_validate(record.result_payload)
        if not _owns_lease(record, lease_token):
            raise ClimateServiceError("PREDICTION_LEASE_LOST", 409)
        record.status = "completed"
        record.stage = "completed"
        record.result_payload = result.model_dump(mode="json")
        record.error_code = None
        record.completed_at = _now()
        _clear_lease(record)
        record.updated_at = _now()
        _store_prediction_result(session, record, result)
        _materialize_health_impact_best_effort(session, record, result)
        session.commit()
    return _add_optional_explanation_after_save(
        result,
        request_id=request_id,
        session_factory=session_factory,
    )


def _store_prediction_result(
    session: Session,
    record: PredictionRequestRecord,
    result: PredictResponse,
) -> None:
    """Record the durable, shared result for this place, outcome and month.

    Runs inside the completion transaction so the request and the result can
    never disagree about what was computed.

    Unlike the health_impact bridge beside it, a failure here is logged rather
    than swallowed at INFO: this row is what the dashboard reads, so a gap is
    a visible product fault, not a known-blocked integration.
    """

    try:
        if record.admin_unit_id is None or record.planning_date is None:
            logger.warning(
                "prediction_result skipped for request %s: no admin unit or "
                "planning date on the record",
                record.id,
            )
            return
        release_id = record.model_release_id
        if release_id is None:
            logger.warning(
                "prediction_result skipped for request %s: no model release",
                record.id,
            )
            return
        # How this release names its reference, so the dashboard can label the
        # anchor without re-reading the manifest on every request.
        active = get_model_mapping(
            session, release_id=release_id, admin_unit_id=record.admin_unit_id
        )
        reference_kind = (
            ((active.input_spec or {}).get("presentation") or {}).get("reference_kind")
            if active
            else None
        )
        problem = integrity_problem(
            result,
            geography_id=record.request_payload.get("geography_id"),
            valid_month=record.planning_date,
        )
        if problem is not None:
            logger.warning(
                "prediction_result refused for request %s: %s", record.id, problem
            )
            return
        upsert_prediction_result(
            session,
            result=result,
            admin_unit_id=record.admin_unit_id,
            outcome=_outcome_from_record(record),
            model_release_id=release_id,
            valid_month=record.planning_date,
            model_artifact_sha256=record.model_artifact_sha256,
            reference_kind=reference_kind,
            climate_input_window_id=record.climate_input_window_id,
            prediction_request_id=record.id,
        )
    except Exception:  # noqa: BLE001 - must not fail an otherwise good run
        logger.exception(
            "prediction_result write failed for request %s; the prediction is "
            "complete but the dashboard will not show it",
            record.id,
        )


def _live_request_for(
    session_factory,
    *,
    admin_unit_id: int,
    model_release_id: str,
    request: PredictRequest,
) -> PredictResponse | PredictionAcceptedResponse | None:
    """An existing request for this grain that still counts, if there is one.

    "Counts" means waiting, queued or running - work that will produce the
    answer - or completed with a payload. A failed request is deliberately not
    matched, so asking again is how a caller retries.

    Matched on the same six things `_stored_result_for` keys a result on -
    place, month, outcome, release, scenario and horizon - because those are
    what make two asks the same question. Who asked, and on what day, do not.

    Two bugs lived in the narrower version of this. Without the release in the
    match, activating a new release for a place returned the *old* release's
    completed payload, so a re-released model never recomputed a month it had
    already answered. And taking only the newest row for the place and month
    before checking the outcome meant an under-five row newer than a low
    birth weight one hid it, so with two outcomes on the dashboard the dedupe
    this function exists to provide silently stopped working and a second
    Copernicus pull was queued. Hence the scan: candidates are walked newest
    first and the first genuine match wins.
    """

    with session_factory() as session:
        candidates = session.scalars(
            select(PredictionRequestRecord)
            .where(
                PredictionRequestRecord.admin_unit_id == admin_unit_id,
                PredictionRequestRecord.planning_date == request.planning_date,
                PredictionRequestRecord.model_release_id == model_release_id,
                PredictionRequestRecord.status.in_(
                    ("waiting", "queued", "running", "completed")
                ),
            )
            .order_by(PredictionRequestRecord.id.desc())
        )
        for record in candidates:
            payload = record.request_payload or {}
            if payload.get("outcome", DEFAULT_OUTCOME) != request.outcome:
                continue
            if payload.get("planning_target", "month") != request.planning_target:
                continue
            if payload.get("projection_scenario") != request.projection_scenario:
                continue
            if payload.get("projection_period") != request.projection_period:
                continue
            if record.status == "completed" and record.result_payload is not None:
                try:
                    return PredictResponse.model_validate(record.result_payload)
                except ValidationError:
                    # A payload whose shape has drifted is not a usable
                    # answer; queue the work again rather than reaching
                    # further back for an even older one.
                    return None
            return _accepted(record)
        return None


def _stored_result_for(
    session_factory,
    *,
    admin_unit_id: int,
    outcome: str,
    model_release_id: str,
    request: PredictRequest,
) -> PredictResponse | None:
    """The completed request behind an existing result for this grain, if any.

    Returns the original ``PredictResponse`` rather than rebuilding one from
    the stored columns, so a repeat caller gets byte-identical climate
    provenance and availability detail to the first.
    """

    with session_factory() as session:
        row = session.scalar(
            select(PredictionResult).where(
                PredictionResult.admin_unit_id == admin_unit_id,
                PredictionResult.outcome == outcome,
                PredictionResult.model_release_id == model_release_id,
                PredictionResult.valid_month == request.planning_date.replace(day=1),
                PredictionResult.scenario
                == _resolve_scenario_label(request.projection_scenario),
                PredictionResult.horizon == resolve_horizon(request.planning_target),
            )
        )
        if row is None or row.prediction_request_id is None:
            return None
        record = session.get(PredictionRequestRecord, row.prediction_request_id)
        if record is None or record.result_payload is None:
            return None
        try:
            return PredictResponse.model_validate(record.result_payload)
        except ValidationError:
            # A payload whose shape has drifted is not a usable answer; fall
            # through and let the request be queued again.
            return None


def _materialize_health_impact_best_effort(
    session: Session,
    record: PredictionRequestRecord,
    result: PredictResponse,
) -> None:
    """Populate ``health_impact`` from a completed prediction if we can.

    Runs inside the same transaction as the completion write so the
    dashboard's read grain stays consistent with the request's result
    payload. Any failure - missing fitted curve, missing admin_unit link,
    unexpected result shape - is logged and swallowed: the prediction
    completion itself is not blocked by a materialization gap.
    """

    try:
        prediction = result.prediction
        admin_unit_id = record.admin_unit_id
        if admin_unit_id is None:
            return
        admin_unit = session.get(AdminUnit, admin_unit_id)
        if admin_unit is None:
            return
        climate_run_id = _resolve_climate_run_for_record(session, record)
        if climate_run_id is None:
            return
        planning_date = record.planning_date
        if planning_date is None:
            return
        planning_target = _planning_target_from_record(record)
        ssp_scenario = _ssp_scenario_from_record(record)
        outcome = _outcome_from_record(record)
        spec = MaterializationInput(
            admin_unit_id=admin_unit_id,
            geography_id=admin_unit.geography_id,
            outcome=outcome,
            planning_target=planning_target,
            valid_month=planning_date.replace(day=1),
            climate_run_id=climate_run_id,
            ssp_scenario=ssp_scenario,
            odds_ratio=prediction.odds_ratio,
            ci95_low=prediction.ci95_low,
            ci95_high=prediction.ci95_high,
            ensemble_spread=None,
        )
        materialize_health_impact(session, spec)
    except ErfParametersNotFound:
        logger.info(
            "Skipping health_impact materialization for request %s: no ErfParameters yet.",
            record.id,
        )
    except Exception:  # noqa: BLE001 - best-effort, must not fail completion
        logger.exception(
            "health_impact materialization failed for request %s; leaving the "
            "prediction completed and the dashboard empty until fixed.",
            record.id,
        )


def _resolve_climate_run_for_record(
    session: Session, record: PredictionRequestRecord
) -> int | None:
    if record.climate_run_id is not None:
        return record.climate_run_id
    window_id = record.climate_input_window_id
    if window_id is None:
        return None
    row = session.scalar(
        select(DistrictClimate.climate_run_id)
        .join(
            ClimateInputMonthRecord,
            ClimateInputMonthRecord.district_climate_id == DistrictClimate.id,
        )
        .join(
            ClimateInputWindowRecord,
            ClimateInputWindowRecord.id
            == ClimateInputMonthRecord.climate_input_window_id,
        )
        .where(ClimateInputWindowRecord.id == window_id)
        .order_by(ClimateInputMonthRecord.lag_index.asc())
        .limit(1)
    )
    return row


def _planning_target_from_record(record: PredictionRequestRecord) -> str:
    payload = record.request_payload or {}
    value = payload.get("planning_target")
    if isinstance(value, str) and value:
        return value
    return "month"


def _ssp_scenario_from_record(record: PredictionRequestRecord) -> str | None:
    payload = record.request_payload or {}
    value = payload.get("projection_scenario")
    return value if isinstance(value, str) and value else None


def _outcome_from_record(record: PredictionRequestRecord) -> str:
    payload = record.request_payload or {}
    value = payload.get("outcome")
    if isinstance(value, str) and value:
        return value
    return DEFAULT_OUTCOME


def fail_prediction_request(
    request_id: int,
    *,
    error_code: str,
    lease_token: str | None = None,
    session_factory=None,
) -> None:
    session_factory = session_factory or get_session_factory()
    with session_factory() as session:
        record = session.get(PredictionRequestRecord, request_id)
        if (
            record is None
            or record.status == "completed"
            or not _owns_lease(record, lease_token)
        ):
            return
        record.status = "failed"
        record.stage = "failed"
        record.error_code = error_code[:128]
        _clear_lease(record)
        record.updated_at = _now()
        session.commit()


def _get_or_create_request(
    session_factory,
    *,
    request_key: str,
    request_payload: dict,
    request: PredictRequest,
    admin_unit_id: int,
    model_release_id: str,
    model_artifact_sha256: str,
    requested_by_user_id: str | None,
    available_from: date | None,
    initial_status: PredictionStatus,
    source_as_of_at: datetime,
) -> PredictionRequestRecord:
    with session_factory() as session:
        record = session.scalar(
            select(PredictionRequestRecord)
            .where(PredictionRequestRecord.request_key == request_key)
            .with_for_update()
        )
        created = False
        if record is None:
            record = PredictionRequestRecord(
                request_key=request_key,
                location_slug=request.geography_id,
                timeframe_id="planning_3m",
                end_month=request.planning_date.strftime("%Y-%m"),
                admin_unit_id=admin_unit_id,
                planning_date=request.planning_date,
                model_release_id=model_release_id,
                model_artifact_sha256=model_artifact_sha256,
                requested_by_user_id=requested_by_user_id,
                available_from=available_from,
                pipeline_version=PREDICTION_PIPELINE_VERSION,
                request_payload=request_payload,
                source_as_of_at=source_as_of_at,
                status=initial_status,
                stage=("waiting_for_data" if initial_status == "waiting" else "queued"),
                attempt_count=1,
            )
            session.add(record)
            try:
                session.flush()
                created = True
            except IntegrityError:
                session.rollback()
                record = session.scalar(
                    select(PredictionRequestRecord)
                    .where(PredictionRequestRecord.request_key == request_key)
                    .with_for_update()
                )
                if record is None:
                    raise

        if not created and record.status == "failed":
            record.status = "queued"
            record.stage = "queued"
            record.attempt_count += 1
            record.dagster_run_id = None
            _clear_lease(record)
            record.next_attempt_at = None
            record.error_code = None
            record.completed_at = None
            record.updated_at = _now()
        if record.model_artifact_sha256 is None:
            record.model_artifact_sha256 = model_artifact_sha256
        if record.source_as_of_at is None:
            record.source_as_of_at = source_as_of_at

        session.commit()
        session.refresh(record)
        session.expunge(record)
        return record


def _status_response(
    record: PredictionRequestRecord,
    climate,
    validated_windows: tuple[int, ...],
) -> PredictionRequestStatusResponse:
    request = PredictRequest.model_validate(record.request_payload)
    result = _public_result(record.result_payload, validated_windows)
    return PredictionRequestStatusResponse(
        request_id=record.id,
        status=cast(PredictionStatus, record.status),
        stage=cast(PredictionStage, record.stage),
        geography_id=request.geography_id,
        planning_date=request.planning_date,
        source_as_of=_source_as_of(record),
        dagster_run_id=record.dagster_run_id,
        error_code=record.error_code,
        climate=climate,
        result=result,
        created_at=_iso(record.created_at),
        updated_at=_iso(record.updated_at),
        available_from=record.available_from,
        planning_target=request.planning_target,
        projection_scenario=request.projection_scenario,
        projection_period=request.projection_period,
    )


def _summary_response(
    record: PredictionRequestRecord,
    validated_windows: tuple[int, ...],
) -> PredictionRequestSummaryResponse:
    request = PredictRequest.model_validate(record.request_payload)
    result = _public_result(record.result_payload, validated_windows)
    odds_ratio = result.prediction.odds_ratio if result is not None else None
    return PredictionRequestSummaryResponse(
        request_id=record.id,
        status=cast(PredictionStatus, record.status),
        stage=cast(PredictionStage, record.stage),
        geography_id=request.geography_id,
        planning_date=request.planning_date,
        source_as_of=_source_as_of(record),
        error_code=record.error_code,
        created_at=_iso(record.created_at),
        updated_at=_iso(record.updated_at),
        available_from=record.available_from,
        planning_target=request.planning_target,
        projection_scenario=request.projection_scenario,
        projection_period=request.projection_period,
        odds_ratio=float(odds_ratio) if odds_ratio is not None else None,
    )


def _public_result(
    payload: dict | None,
    validated_windows: tuple[int, ...],
) -> PredictResponse | None:
    if payload is None:
        return None
    result = PredictResponse.model_validate(payload)
    candidates = result.predictions or [result.prediction]
    predictions = [
        prediction
        for prediction in candidates
        if prediction.pregnancy_window in validated_windows
    ]
    if not predictions:
        return None
    return result.model_copy(
        update={"prediction": predictions[0], "predictions": predictions}
    )


def _validated_windows_for_record(
    session: Session,
    record: PredictionRequestRecord,
) -> tuple[int, ...]:
    if record.admin_unit_id is None or record.model_release_id is None:
        return ()
    mapping = get_model_mapping(
        session,
        release_id=record.model_release_id,
        admin_unit_id=record.admin_unit_id,
    )
    return mapping.validated_pregnancy_windows if mapping else ()


def _accepted(record: PredictionRequestRecord) -> PredictionAcceptedResponse:
    request = PredictRequest.model_validate(record.request_payload)
    status = (
        record.status if record.status in {"waiting", "queued", "running"} else "queued"
    )
    return PredictionAcceptedResponse(
        request_id=record.id,
        status=cast(Literal["waiting", "queued", "running"], status),
        stage=cast(PredictionStage, record.stage),
        geography_id=request.geography_id,
        planning_date=request.planning_date,
        source_as_of=_source_as_of(record),
        status_url=f"/climate/prediction-requests/{record.id}",
        message=(
            "Plan saved. It will run when the seasonal forecast is published."
            if status == "waiting"
            else (
                "Prediction is already running."
                if status == "running"
                else "Prediction is queued."
            )
        ),
        available_from=record.available_from,
        planning_target=request.planning_target,
        projection_scenario=request.projection_scenario,
        projection_period=request.projection_period,
    )


def _add_optional_explanation_after_save(
    result: PredictResponse,
    *,
    request_id: int,
    session_factory,
) -> PredictResponse:
    """Add language output only after the deterministic result is durable."""

    try:
        values = result.prediction.temperatures_c
        window = result.prediction.pregnancy_window
        # Narration is built from an LbwScore, which needs three monthly
        # values and a pregnancy window. A day-grain prediction has neither,
        # so it keeps the deterministic result without a narrative.
        if len(values) != 3 or window is None:
            return result
        score = LbwScore(
            area=result.prediction.area,
            geography_level=result.prediction.geography_level,
            pregnancy_window=window,
            temperatures_c=(values[0], values[1], values[2]),
            reference_temperature_c=result.prediction.reference_temperature_c,
            odds_ratio=result.prediction.odds_ratio,
            ci95_low=result.prediction.ci95_low,
            ci95_high=result.prediction.ci95_high,
            on_training_support=result.prediction.on_training_support,
            model_file=result.prediction.model_file,
            model_version=result.prediction.model_version,
            model_sha256=result.prediction.model_sha256 or "",
            warning=result.prediction.warning,
        )
        explanation = explain_if_configured(score)
        if explanation is None:
            return result

        enriched = result.model_copy(deep=True)
        enriched.prediction.explanation = explanation
        for prediction in enriched.predictions:
            if prediction.pregnancy_window == enriched.prediction.pregnancy_window:
                prediction.explanation = explanation
                break
        with session_factory() as session:
            record = session.get(
                PredictionRequestRecord, request_id, with_for_update=True
            )
            if record is None or record.status != "completed":
                return result
            record.result_payload = enriched.model_dump(mode="json")
            record.updated_at = _now()
            session.commit()
        return enriched
    except Exception:
        # The numerical result is already saved and must remain available.
        logger.exception("Optional explanation failed for request %s", request_id)
        return result


def _record_values(record: PredictionRequestRecord) -> dict:
    request = PredictRequest.model_validate(record.request_payload)
    return {
        "geography_id": request.geography_id,
        "planning_date": request.planning_date,
        "climate_input_window_id": record.climate_input_window_id,
        "source_as_of": _source_as_of_datetime(record),
        "projection_scenario": request.projection_scenario,
        "projection_period": request.projection_period,
    }


def _available_from(request: PredictRequest, place, *, now: datetime) -> date | None:
    options = planning_options_for_place(
        place.admin_unit.code,
        geography_path=place.geography.path,
        now=now,
    )
    if request.planning_target == "next_three_months":
        if request.planning_date != options.next_three_months.planning_date:
            raise ClimateServiceError("PLANNING_WINDOW_INVALID", 409)
        return None
    if request.planning_target == "next_heat_season":
        heat_season = options.next_heat_season
        if heat_season is None or request.planning_date != heat_season.planning_date:
            raise ClimateServiceError("PLANNING_WINDOW_INVALID", 409)
        return None if heat_season.available else heat_season.available_from
    return None


def _request_key(payload: dict) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _planning_date(record: PredictionRequestRecord) -> date:
    if record.planning_date is not None:
        return record.planning_date
    return PredictRequest.model_validate(record.request_payload).planning_date


def _source_as_of(record: PredictionRequestRecord) -> date:
    value = record.request_payload.get("source_as_of")
    if isinstance(value, str):
        try:
            return date.fromisoformat(value)
        except ValueError:
            pass
    created_at = record.created_at
    if created_at is not None:
        return created_at.date()
    return _now().date()


def _source_as_of_datetime(record: PredictionRequestRecord) -> datetime:
    if record.source_as_of_at is not None:
        return _aware(record.source_as_of_at)
    value = _source_as_of(record)
    return datetime(value.year, value.month, value.day, tzinfo=timezone.utc)


def _required(value: int | None) -> int:
    if value is None:
        raise ClimateServiceError("PREDICTION_REQUEST_INVALID", 409)
    return value


def _required_text(value: str | None) -> str:
    if not value:
        raise ClimateServiceError("PREDICTION_REQUEST_INVALID", 409)
    return value


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _lease_duration() -> timedelta:
    return timedelta(seconds=int(os.getenv("PREDICTION_LEASE_SECONDS", "3600")))


def _owns_lease(record: PredictionRequestRecord, lease_token: str | None) -> bool:
    if record.lease_token is None:
        # Direct service calls in tests and administrative repair tools do not
        # impersonate a leased worker.
        return lease_token is None
    return (
        lease_token is not None
        and secrets.compare_digest(record.lease_token, lease_token)
        and record.lease_expires_at is not None
        and _aware(record.lease_expires_at) > _now()
    )


def _extend_lease(record: PredictionRequestRecord) -> None:
    now = _now()
    record.heartbeat_at = now
    record.lease_expires_at = now + _lease_duration()


def _clear_lease(record: PredictionRequestRecord) -> None:
    record.lease_token = None
    record.lease_owner = None
    record.lease_expires_at = None
    record.heartbeat_at = None


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def _iso(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()
