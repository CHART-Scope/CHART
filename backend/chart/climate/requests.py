from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from chart.shared.db.models import PredictionRequestRecord
from chart.shared.db.session import get_session_factory

from .schemas import (
    PredictRequest,
    PredictResponse,
    PredictionAcceptedResponse,
    PredictionRequestStatusResponse,
    PredictionStage,
)
from .service import ClimateServiceError, predict, validate_prediction_request

PREDICTION_PIPELINE_VERSION = 1


@dataclass(frozen=True)
class QueuedPredictionRequest:
    id: int
    location_slug: str
    end_month: str | None
    attempt_count: int


def submit_prediction(
    request: PredictRequest,
    *,
    session_factory=None,
) -> PredictResponse | PredictionAcceptedResponse:
    """Return a preview or enqueue one idempotent outcome prediction."""
    if request.outcome is None:
        return predict(request, session_factory=session_factory)

    validate_prediction_request(request)
    session_factory = session_factory or get_session_factory()
    request_payload = request.model_dump(mode="json", exclude_none=True)
    record = _get_or_create_request(
        session_factory,
        request_key=_request_key(request_payload),
        request_payload=request_payload,
        request=request,
    )

    if record.status == "completed" and record.result_payload is not None:
        return PredictResponse.model_validate(record.result_payload)
    return _accepted(record)


def get_prediction_request(
    request_id: int,
    *,
    session_factory=None,
) -> PredictionRequestStatusResponse:
    session_factory = session_factory or get_session_factory()
    with session_factory() as session:
        record = session.get(PredictionRequestRecord, request_id)
        if record is None:
            raise ClimateServiceError("PREDICTION_REQUEST_NOT_FOUND", 404)
        return _status_response(record)


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
            .order_by(PredictionRequestRecord.created_at.asc())
            .limit(limit)
        ).all()
        return [
            QueuedPredictionRequest(
                id=record.id,
                location_slug=record.location_slug,
                end_month=record.end_month,
                attempt_count=record.attempt_count,
            )
            for record in records
        ]


def mark_prediction_request_running(
    request_id: int,
    *,
    dagster_run_id: str,
    session_factory=None,
) -> None:
    session_factory = session_factory or get_session_factory()
    with session_factory() as session:
        record = session.get(PredictionRequestRecord, request_id, with_for_update=True)
        if record is None:
            raise ClimateServiceError("PREDICTION_REQUEST_NOT_FOUND", 404)
        if record.status == "completed":
            return
        record.status = "running"
        record.stage = "predicting"
        record.dagster_run_id = dagster_run_id
        record.error_code = None
        record.updated_at = _now()
        session.commit()


def set_prediction_request_stage(
    request_id: int,
    stage: PredictionStage,
    *,
    session_factory=None,
) -> None:
    session_factory = session_factory or get_session_factory()
    with session_factory() as session:
        record = session.get(PredictionRequestRecord, request_id)
        if record is None:
            raise ClimateServiceError("PREDICTION_REQUEST_NOT_FOUND", 404)
        if record.status != "running":
            return
        record.stage = stage
        record.updated_at = _now()
        session.commit()


def complete_prediction_request(
    request_id: int,
    *,
    session_factory=None,
    lbw_service_url: str | None = None,
) -> PredictResponse:
    session_factory = session_factory or get_session_factory()
    with session_factory() as session:
        record = session.get(PredictionRequestRecord, request_id)
        if record is None:
            raise ClimateServiceError("PREDICTION_REQUEST_NOT_FOUND", 404)
        if record.status == "completed" and record.result_payload is not None:
            return PredictResponse.model_validate(record.result_payload)
        request = PredictRequest.model_validate(record.request_payload)

    result = predict(
        request,
        session_factory=session_factory,
        lbw_service_url=lbw_service_url,
    )

    with session_factory() as session:
        record = session.get(PredictionRequestRecord, request_id, with_for_update=True)
        if record is None:
            raise ClimateServiceError("PREDICTION_REQUEST_NOT_FOUND", 404)
        completed = result.model_copy(
            update={"request_id": record.id, "request_status": "completed"}
        )
        record.status = "completed"
        record.stage = "completed"
        record.result_payload = completed.model_dump(mode="json")
        record.climate_run_id = result.availability.climate_run_id
        record.error_code = None
        record.completed_at = _now()
        record.updated_at = _now()
        session.commit()
        return completed


def fail_prediction_request(
    request_id: int,
    *,
    error_code: str,
    session_factory=None,
) -> None:
    session_factory = session_factory or get_session_factory()
    with session_factory() as session:
        record = session.get(PredictionRequestRecord, request_id)
        if record is None or record.status == "completed":
            return
        record.status = "failed"
        record.stage = "failed"
        record.error_code = error_code[:128]
        record.updated_at = _now()
        session.commit()


def _get_or_create_request(
    session_factory,
    *,
    request_key: str,
    request_payload: dict,
    request: PredictRequest,
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
                location_slug=request.location_slug,
                timeframe_id=request.timeframe_id,
                end_month=request.end_month,
                request_payload=request_payload,
                status="queued",
                stage="queued",
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

        if not created and (
            record.status == "failed"
            or (record.status == "completed" and record.result_payload is None)
        ):
            record.status = "queued"
            record.stage = "queued"
            record.attempt_count += 1
            record.dagster_run_id = None
            record.result_payload = None
            record.error_code = None
            record.completed_at = None
            record.updated_at = _now()

        session.commit()
        session.refresh(record)
        session.expunge(record)
        return record


def _status_response(
    record: PredictionRequestRecord,
) -> PredictionRequestStatusResponse:
    result = (
        PredictResponse.model_validate(record.result_payload)
        if record.result_payload is not None
        else None
    )
    return PredictionRequestStatusResponse.model_validate(
        {
            "request_id": record.id,
            "status": record.status,
            "stage": record.stage,
            "location_slug": record.location_slug,
            "timeframe_id": record.timeframe_id,
            "dagster_run_id": record.dagster_run_id,
            "error_code": record.error_code,
            "result": result,
            "created_at": _iso(record.created_at),
            "updated_at": _iso(record.updated_at),
        }
    )


def _accepted(record: PredictionRequestRecord) -> PredictionAcceptedResponse:
    status = record.status if record.status in {"queued", "running"} else "queued"
    message = (
        "Prediction is already running in the background."
        if status == "running"
        else "Prediction is queued for background processing."
    )
    return PredictionAcceptedResponse.model_validate(
        {
            "request_id": record.id,
            "status": status,
            "stage": record.stage,
            "location_slug": record.location_slug,
            "timeframe_id": record.timeframe_id,
            "status_url": f"/climate/prediction-requests/{record.id}",
            "message": message,
        }
    )


def _request_key(payload: dict) -> str:
    versioned_payload = {
        "pipeline_version": PREDICTION_PIPELINE_VERSION,
        "request": payload,
    }
    canonical = json.dumps(versioned_payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()
