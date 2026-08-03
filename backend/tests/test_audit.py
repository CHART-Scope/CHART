from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from chart.audit.retention import purge_older_than
from chart.audit.schemas import AuditBatchIn, AuditEventIn
from chart.audit.service import insert_events, list_events
from chart.shared.db.base import Base
from chart.shared.db.models import (
    AdminUnit,
    AppUser,
    AuditEventRecord,
    Geography,
    PredictionRequestRecord,
)


@pytest.fixture
def session_factory():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    # Only create the tables this suite touches; a couple of unrelated tables
    # in the shared metadata use Postgres JSONB and can't render on SQLite.
    tables = [
        AppUser.__table__,
        Geography.__table__,
        AdminUnit.__table__,
        PredictionRequestRecord.__table__,
        AuditEventRecord.__table__,
    ]
    Base.metadata.create_all(engine, tables=tables)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    _seed_user(factory)
    return factory


def _seed_user(session_factory) -> None:
    with session_factory() as session:
        session.add(
            AppUser(
                id="user-a",
                username="a",
                display_name="A",
            )
        )
        session.add(
            AppUser(
                id="user-b",
                username="b",
                display_name="B",
            )
        )
        session.commit()


def _event(seq: int, occurred_at: datetime | None = None) -> AuditEventIn:
    return AuditEventIn(
        client_seq=seq,
        event_type="whatif_tick",
        occurred_at=occurred_at
        or datetime(2026, 8, 3, 12, 0, seq, tzinfo=timezone.utc),
        geography_id="geo-in-madhya-pradesh",
        payload={"temperature_c": 32.5 + seq},
    )


def test_insert_events_persists_a_batch(session_factory) -> None:
    batch = AuditBatchIn(
        session_id="s1",
        flush_id="f1",
        events=[_event(0), _event(1), _event(2)],
    )
    inserted = insert_events(
        user_id="user-a", batch=batch, session_factory=session_factory
    )
    assert inserted == 3
    with session_factory() as session:
        rows = session.scalars(select(AuditEventRecord)).all()
        assert [row.client_seq for row in rows] == [0, 1, 2]
        assert {row.user_id for row in rows} == {"user-a"}


def test_insert_events_is_idempotent_on_replay(session_factory) -> None:
    batch = AuditBatchIn(
        session_id="s1",
        flush_id="f1",
        events=[_event(0), _event(1)],
    )
    insert_events(user_id="user-a", batch=batch, session_factory=session_factory)
    replay = insert_events(
        user_id="user-a", batch=batch, session_factory=session_factory
    )
    assert replay == 0
    partial = AuditBatchIn(
        session_id="s1",
        flush_id="f1",
        events=[_event(1), _event(2)],
    )
    inserted = insert_events(
        user_id="user-a", batch=partial, session_factory=session_factory
    )
    assert inserted == 1


def test_list_events_is_user_scoped_and_newest_first(session_factory) -> None:
    now = datetime(2026, 8, 3, 12, 0, tzinfo=timezone.utc)
    insert_events(
        user_id="user-a",
        batch=AuditBatchIn(
            session_id="s1",
            flush_id="f1",
            events=[
                _event(0, occurred_at=now),
                _event(1, occurred_at=now + timedelta(seconds=1)),
            ],
        ),
        session_factory=session_factory,
    )
    insert_events(
        user_id="user-b",
        batch=AuditBatchIn(
            session_id="s2",
            flush_id="f1",
            events=[_event(0, occurred_at=now + timedelta(seconds=2))],
        ),
        session_factory=session_factory,
    )
    page = list_events(
        user_id="user-a", limit=10, before=None, session_factory=session_factory
    )
    assert [event.client_seq for event in page.items] == [1, 0]
    assert all(event.event_type == "whatif_tick" for event in page.items)


def test_list_events_hydrates_run_summary(session_factory) -> None:
    _seed_prediction(session_factory)
    insert_events(
        user_id="user-a",
        batch=AuditBatchIn(
            session_id="s1",
            flush_id="f1",
            events=[
                AuditEventIn(
                    client_seq=0,
                    event_type="prediction_submitted",
                    occurred_at=datetime(2026, 8, 3, 12, 0, tzinfo=timezone.utc),
                    prediction_request_id=1,
                    payload={},
                )
            ],
        ),
        session_factory=session_factory,
    )
    page = list_events(
        user_id="user-a", limit=10, before=None, session_factory=session_factory
    )
    assert page.items[0].run_summary is not None
    assert page.items[0].run_summary.status == "queued"
    assert page.items[0].run_summary.admin_unit_name == "Madhya Pradesh"


def test_purge_older_than_deletes_old_rows(session_factory) -> None:
    with session_factory() as session:
        session.add(
            AuditEventRecord(
                user_id="user-a",
                session_id="s1",
                flush_id="f1",
                client_seq=0,
                event_type="whatif_tick",
                occurred_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
                received_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
                payload={},
            )
        )
        session.add(
            AuditEventRecord(
                user_id="user-a",
                session_id="s1",
                flush_id="f2",
                client_seq=0,
                event_type="whatif_tick",
                occurred_at=datetime(2026, 8, 3, tzinfo=timezone.utc),
                received_at=datetime(2026, 8, 3, tzinfo=timezone.utc),
                payload={},
            )
        )
        session.commit()

    now = datetime(2026, 8, 3, 12, 0, tzinfo=timezone.utc)
    dry = purge_older_than(
        days=30, dry_run=True, now=now, session_factory=session_factory
    )
    assert dry == 1
    with session_factory() as session:
        assert len(session.scalars(select(AuditEventRecord)).all()) == 2
    real = purge_older_than(days=30, now=now, session_factory=session_factory)
    assert real == 1
    with session_factory() as session:
        remaining = session.scalars(select(AuditEventRecord)).all()
        assert [row.flush_id for row in remaining] == ["f2"]


def _seed_prediction(session_factory) -> None:
    with session_factory() as session:
        session.add(
            Geography(slug="madhya-pradesh", country="India", name="Madhya Pradesh")
        )
        session.flush()
        session.add(
            AdminUnit(
                id=1,
                geography_id=1,
                code="madhya-pradesh",
                name="Madhya Pradesh",
                level="state",
            )
        )
        session.add(
            PredictionRequestRecord(
                id=1,
                request_key="rk",
                location_slug="geo-in-madhya-pradesh",
                timeframe_id="2026-08",
                admin_unit_id=1,
                planning_date=date(2026, 8, 1),
                request_payload={},
                status="queued",
                stage="queued",
                attempt_count=1,
            )
        )
        session.commit()
