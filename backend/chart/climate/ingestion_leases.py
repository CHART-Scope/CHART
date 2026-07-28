from __future__ import annotations

import hashlib
import json
import logging
import os
import random
import secrets
import threading
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy.exc import IntegrityError

from chart.shared.db.models import IngestionLeaseRecord
from chart.shared.db.session import get_session_factory

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class IngestionClaim:
    key: str
    owner_token: str | None = None
    completed_run_id: int | None = None
    terminal_error_code: str | None = None


def ingestion_key(payload: Mapping[str, object]) -> str:
    canonical = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    ).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def run_single_flight_ingestion(
    payload: Mapping[str, object],
    loader: Callable[[], int],
    *,
    session_factory=None,
    wait_timeout_seconds: int | None = None,
) -> int:
    """Run one provider acquisition globally and let peers reuse its result."""

    session_factory = session_factory or get_session_factory()
    key = ingestion_key(payload)
    timeout = (
        wait_timeout_seconds
        if wait_timeout_seconds is not None
        else int(os.getenv("INGESTION_WAIT_TIMEOUT_SECONDS", "3300"))
    )
    deadline = time.monotonic() + timeout
    delay = 0.5

    while True:
        claim = _claim(key, session_factory=session_factory)
        if claim.completed_run_id is not None:
            return claim.completed_run_id
        if claim.terminal_error_code is not None:
            raise RuntimeError(claim.terminal_error_code)
        if claim.owner_token is not None:
            stop_heartbeat = _start_heartbeat(claim, session_factory=session_factory)
            try:
                run_id = loader()
            except Exception as error:
                stop_heartbeat()
                try:
                    _finish(
                        claim,
                        session_factory=session_factory,
                        error_code=getattr(error, "code", type(error).__name__),
                    )
                except Exception:
                    logger.exception(
                        "Could not record failed climate ingestion %s", key
                    )
                raise
            stop_heartbeat()
            _finish(
                claim,
                session_factory=session_factory,
                climate_run_id=run_id,
            )
            return run_id
        if time.monotonic() >= deadline:
            raise TimeoutError("CLIMATE_INGESTION_WAIT_TIMED_OUT")
        time.sleep(delay + random.uniform(0, delay * 0.2))
        delay = min(10.0, delay * 1.7)


def _claim(key: str, *, session_factory) -> IngestionClaim:
    now = _now()
    with session_factory() as session:
        record = session.get(IngestionLeaseRecord, key, with_for_update=True)
        if record is None:
            token = secrets.token_hex(24)
            record = IngestionLeaseRecord(
                key=key,
                status="running",
                owner_token=token,
                lease_expires_at=now + _lease_duration(),
                attempt_count=1,
            )
            session.add(record)
            try:
                session.commit()
                return IngestionClaim(key=key, owner_token=token)
            except IntegrityError:
                session.rollback()
                return _claim_existing(key, session_factory=session_factory)
        return _claim_record(record, session, now=now)


def _claim_existing(key: str, *, session_factory) -> IngestionClaim:
    with session_factory() as session:
        record = session.get(IngestionLeaseRecord, key, with_for_update=True)
        if record is None:
            return _claim(key, session_factory=session_factory)
        return _claim_record(record, session, now=_now())


def _claim_record(record, session, *, now: datetime) -> IngestionClaim:
    if record.status == "completed" and record.result_climate_run_id is not None:
        return IngestionClaim(
            key=record.key,
            completed_run_id=record.result_climate_run_id,
        )
    if record.status == "running" and _aware(record.lease_expires_at) > now:
        return IngestionClaim(key=record.key)
    if record.status == "failed":
        failure_age = now - _aware(record.updated_at)
        reset_after = timedelta(
            seconds=int(os.getenv("INGESTION_FAILURE_RESET_SECONDS", "1800"))
        )
        max_attempts = max(1, int(os.getenv("INGESTION_MAX_ATTEMPTS", "3")))
        if record.attempt_count >= max_attempts and failure_age < reset_after:
            return IngestionClaim(
                key=record.key,
                terminal_error_code="CLIMATE_INGESTION_RETRY_EXHAUSTED",
            )
        retry_after = timedelta(seconds=min(300, 2 ** max(1, record.attempt_count)))
        if failure_age < retry_after:
            return IngestionClaim(key=record.key)
        if failure_age >= reset_after:
            record.attempt_count = 0

    token = secrets.token_hex(24)
    record.status = "running"
    record.owner_token = token
    record.lease_expires_at = now + _lease_duration()
    record.attempt_count += 1
    record.result_climate_run_id = None
    record.error_code = None
    record.updated_at = now
    session.commit()
    return IngestionClaim(key=record.key, owner_token=token)


def _start_heartbeat(claim: IngestionClaim, *, session_factory):
    stop = threading.Event()
    interval = max(5, int(os.getenv("INGESTION_HEARTBEAT_SECONDS", "60")))

    def heartbeat() -> None:
        while not stop.wait(interval):
            try:
                with session_factory() as session:
                    record = session.get(
                        IngestionLeaseRecord, claim.key, with_for_update=True
                    )
                    if (
                        record is None
                        or claim.owner_token is None
                        or not secrets.compare_digest(
                            record.owner_token, claim.owner_token
                        )
                        or record.status != "running"
                    ):
                        return
                    now = _now()
                    record.lease_expires_at = now + _lease_duration()
                    record.updated_at = now
                    session.commit()
            except Exception:
                logger.exception("Could not heartbeat climate ingestion %s", claim.key)

    thread = threading.Thread(
        target=heartbeat,
        name=f"ingestion-lease-{claim.key[:12]}",
        daemon=True,
    )
    thread.start()

    def stop_heartbeat() -> None:
        stop.set()
        thread.join(timeout=2)

    return stop_heartbeat


def _finish(
    claim: IngestionClaim,
    *,
    session_factory,
    climate_run_id: int | None = None,
    error_code: str | None = None,
) -> None:
    with session_factory() as session:
        record = session.get(IngestionLeaseRecord, claim.key, with_for_update=True)
        if (
            record is None
            or claim.owner_token is None
            or not secrets.compare_digest(record.owner_token, claim.owner_token)
        ):
            return
        if climate_run_id is not None:
            record.status = "completed"
            record.result_climate_run_id = climate_run_id
            record.error_code = None
        else:
            record.status = "failed"
            record.result_climate_run_id = None
            record.error_code = (error_code or "INGESTION_FAILED")[:128]
        record.updated_at = _now()
        session.commit()


def _lease_duration() -> timedelta:
    return timedelta(seconds=int(os.getenv("INGESTION_LEASE_SECONDS", "3600")))


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
