"""Dagster's Postgres storage must run on psycopg2.

dagster-postgres turns the deployment's `postgres_db` settings into a plain
postgresql:// URL and writes every run event with `NOTIFY run_events, %s`.
SQLAlchemy 2.1 maps that URL to psycopg 3, which rejects a bound parameter in
NOTIFY ("syntax error at or near $1"); on the sandbox every run then failed and
prediction requests expired in the queue. This builds the engine exactly as
dagster-postgres does and checks the driver, and sends the real NOTIFY when a
Postgres is reachable (CHART_E2E_POSTGRES_URL).
"""

from __future__ import annotations

import os
from urllib.parse import urlparse

import pytest
import sqlalchemy as sa
from dagster_postgres.utils import pg_url_from_config


def _storage_url() -> str:
    target = urlparse(
        os.getenv(
            "CHART_E2E_POSTGRES_URL", "postgresql://chart:chart@127.0.0.1:5434/chart"
        )
    )
    return pg_url_from_config(
        {
            "postgres_db": {
                "username": target.username or "chart",
                "password": target.password or "chart",
                "hostname": target.hostname or "127.0.0.1",
                "db_name": target.path.lstrip("/") or "chart",
                "port": target.port or 5432,
            }
        }
    )


def test_dagster_storage_url_uses_psycopg2() -> None:
    engine = sa.create_engine(_storage_url())
    assert engine.dialect.driver == "psycopg2"


@pytest.mark.skipif(
    not os.getenv("CHART_E2E_POSTGRES_URL"),
    reason="set CHART_E2E_POSTGRES_URL to send the NOTIFY to a real Postgres",
)
def test_run_event_notify_is_accepted_by_postgres() -> None:
    engine = sa.create_engine(_storage_url())
    with engine.begin() as connection:
        connection.execute(
            sa.text("NOTIFY run_events, :notify_id"), {"notify_id": "e2e"}
        )
