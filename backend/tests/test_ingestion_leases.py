from __future__ import annotations

from unittest.mock import Mock

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from chart.climate.ingestion_leases import run_single_flight_ingestion
from chart.shared.db.base import Base
from chart.shared.db.models import IngestionLeaseRecord


@pytest.fixture
def session_factory():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def test_completed_acquisition_is_reused_without_calling_provider(
    session_factory,
) -> None:
    first_loader = Mock(return_value=17)
    second_loader = Mock(side_effect=AssertionError("provider called twice"))
    identity = {"place": 7, "source": "seasonal", "issue": "2026-07"}

    first = run_single_flight_ingestion(
        identity,
        first_loader,
        session_factory=session_factory,
    )
    second = run_single_flight_ingestion(
        identity,
        second_loader,
        session_factory=session_factory,
    )

    assert first == second == 17
    first_loader.assert_called_once_with()
    second_loader.assert_not_called()
    with session_factory() as session:
        assert (
            session.scalar(select(func.count()).select_from(IngestionLeaseRecord))
            == 1
        )


def test_failed_acquisition_is_not_immediately_retried_by_a_peer(
    session_factory,
) -> None:
    identity = {"place": 7, "source": "observed", "months": ["2026-06"]}
    with pytest.raises(ValueError, match="provider unavailable"):
        run_single_flight_ingestion(
            identity,
            lambda: (_ for _ in ()).throw(ValueError("provider unavailable")),
            session_factory=session_factory,
        )

    peer_loader = Mock(return_value=18)
    with pytest.raises(TimeoutError, match="CLIMATE_INGESTION_WAIT_TIMED_OUT"):
        run_single_flight_ingestion(
            identity,
            peer_loader,
            session_factory=session_factory,
            wait_timeout_seconds=0,
        )

    peer_loader.assert_not_called()
