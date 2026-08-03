from __future__ import annotations

from datetime import datetime

from sqlalchemy import insert, select
from sqlalchemy.orm import Session

from chart.shared.db.models import (
    AdminUnit,
    AuditEventRecord,
    PredictionRequestRecord,
)
from chart.shared.db.session import get_session_factory

from .schemas import (
    AuditBatchIn,
    AuditEventOut,
    AuditListResponse,
    AuditRunSummary,
)


def insert_events(
    *,
    user_id: str,
    batch: AuditBatchIn,
    session_factory=None,
) -> int:
    """Batch insert with client-side dedupe on (session, flush, seq).

    We pre-filter against the unique key so this stays portable across
    Postgres and the SQLite in-memory used by unit tests, while still
    matching the DB unique-index guard (which is the true source of
    idempotency on retries).
    """

    session_factory = session_factory or get_session_factory()
    with session_factory() as session:
        seqs = [event.client_seq for event in batch.events]
        existing = set(
            session.scalars(
                select(AuditEventRecord.client_seq).where(
                    AuditEventRecord.session_id == batch.session_id,
                    AuditEventRecord.flush_id == batch.flush_id,
                    AuditEventRecord.client_seq.in_(seqs),
                )
            ).all()
        )
        fresh = [event for event in batch.events if event.client_seq not in existing]
        if not fresh:
            return 0
        session.execute(
            insert(AuditEventRecord),
            [
                {
                    "user_id": user_id,
                    "session_id": batch.session_id,
                    "flush_id": batch.flush_id,
                    "client_seq": event.client_seq,
                    "event_type": event.event_type,
                    "occurred_at": event.occurred_at,
                    "geography_id": event.geography_id,
                    "admin_unit_id": event.admin_unit_id,
                    "prediction_request_id": event.prediction_request_id,
                    "payload": event.payload,
                }
                for event in fresh
            ],
        )
        session.commit()
        return len(fresh)


def list_events(
    *,
    user_id: str,
    limit: int,
    before: datetime | None,
    session_factory=None,
) -> AuditListResponse:
    """Return one page of the current user's events, newest first."""

    session_factory = session_factory or get_session_factory()
    with session_factory() as session:
        rows = _fetch_rows(session, user_id=user_id, limit=limit, before=before)
        run_summaries = _load_run_summaries(session, rows)
        items = [
            _to_out(
                row,
                (
                    run_summaries.get(row.prediction_request_id)
                    if row.prediction_request_id is not None
                    else None
                ),
            )
            for row in rows
        ]
        next_before = rows[-1].occurred_at if len(rows) == limit else None
        return AuditListResponse(items=items, next_before=next_before)


def _fetch_rows(
    session: Session,
    *,
    user_id: str,
    limit: int,
    before: datetime | None,
) -> list[AuditEventRecord]:
    statement = (
        select(AuditEventRecord)
        .where(AuditEventRecord.user_id == user_id)
        .order_by(AuditEventRecord.occurred_at.desc(), AuditEventRecord.id.desc())
        .limit(limit)
    )
    if before is not None:
        statement = statement.where(AuditEventRecord.occurred_at < before)
    return list(session.scalars(statement).all())


def _load_run_summaries(
    session: Session,
    rows: list[AuditEventRecord],
) -> dict[int, AuditRunSummary]:
    request_ids = {
        row.prediction_request_id for row in rows if row.prediction_request_id
    }
    if not request_ids:
        return {}
    statement = (
        select(
            PredictionRequestRecord.id,
            PredictionRequestRecord.status,
            PredictionRequestRecord.planning_date,
            AdminUnit.name,
        )
        .join(
            AdminUnit,
            AdminUnit.id == PredictionRequestRecord.admin_unit_id,
            isouter=True,
        )
        .where(PredictionRequestRecord.id.in_(request_ids))
    )
    summaries: dict[int, AuditRunSummary] = {}
    for request_id, status, planning_date, admin_unit_name in session.execute(
        statement
    ):
        summaries[request_id] = AuditRunSummary(
            request_id=request_id,
            status=status,
            planning_date=planning_date.isoformat() if planning_date else None,
            admin_unit_name=admin_unit_name,
        )
    return summaries


def _to_out(
    row: AuditEventRecord,
    run_summary: AuditRunSummary | None,
) -> AuditEventOut:
    return AuditEventOut(
        id=row.id,
        session_id=row.session_id,
        flush_id=row.flush_id,
        client_seq=row.client_seq,
        event_type=row.event_type,  # type: ignore[arg-type]
        occurred_at=row.occurred_at,
        received_at=row.received_at,
        geography_id=row.geography_id,
        admin_unit_id=row.admin_unit_id,
        prediction_request_id=row.prediction_request_id,
        payload=row.payload,
        run_summary=run_summary,
    )
