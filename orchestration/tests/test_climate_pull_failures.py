"""End to end: a queued climate pull that cannot finish must not stay queued.

Each test drives the real sensor, the real Dagster job and a real Dagster
instance against a real database, and reads the outcome from the job row the
dashboard polls. Nothing below the process boundary is mocked; the database is
in-memory SQLite so the run is repeatable.
"""

from __future__ import annotations

import json
from datetime import date
from unittest.mock import patch

import dagster as dg
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from chart.climate.ingestion_jobs import create_job
from chart.shared.db.base import Base
from chart.shared.db.models import (
    AdminUnit,
    AppGeography,
    ClimateIngestionJob,
    Geography,
)
from chart_pipeline.definitions import (
    climate_ingestion_job,
    pending_climate_ingestions_sensor,
)

SQUARE = {
    "type": "MultiPolygon",
    "coordinates": [[[[36.0, -1.0], [37.0, -1.0], [37.0, -2.0], [36.0, -1.0]]]],
}


@pytest.fixture
def session_factory():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    with patch("chart_pipeline.definitions.get_session_factory", return_value=factory):
        yield factory


def _queue_pull(factory, *, with_bbox: bool) -> int:
    """A Kenya pull over one county, the way the API queues it."""
    with factory() as session:
        geography = Geography(slug="kenya", country="Kenya", name="Kenya")
        county = AppGeography(
            id="geo-ke-nairobi",
            country_code="KE",
            level="county",
            level_label="County",
            name="Nairobi",
            path="kenya/nairobi",
        )
        session.add_all([geography, county])
        session.flush()
        bbox = (
            {
                "bbox_north": -1.0,
                "bbox_west": 36.0,
                "bbox_south": -2.0,
                "bbox_east": 37.0,
            }
            if with_bbox
            else {}
        )
        session.add(
            AdminUnit(
                geography_id=geography.id,
                app_geography_id=county.id,
                level="county",
                code="nairobi",
                name="Nairobi",
                boundary=json.dumps(SQUARE),
                **bbox,
            )
        )
        job, _ = create_job(session, country_code="KE", months=[date(2026, 8, 1)])
        session.commit()
        return job.id


def _job(factory, job_id: int) -> ClimateIngestionJob:
    with factory() as session:
        job = session.get(ClimateIngestionJob, job_id)
        assert job is not None
        session.expunge(job)
        return job


def test_pull_that_fails_while_preparing_is_recorded_failed(session_factory):
    # A county with a boundary but no bounding box makes the country envelope
    # raise before any download - the preparation step that used to escape the
    # failure handler and leave the job "running" forever.
    job_id = _queue_pull(session_factory, with_bbox=False)
    instance = dg.DagsterInstance.ephemeral()

    requests = list(
        pending_climate_ingestions_sensor(dg.build_sensor_context(instance=instance))
    )
    assert len(requests) == 1
    request = requests[0]
    assert isinstance(request, dg.RunRequest)

    result = climate_ingestion_job.execute_in_process(
        run_config=request.run_config,
        tags=request.tags,
        instance=instance,
        raise_on_error=False,
    )

    assert not result.success
    job = _job(session_factory, job_id)
    assert (job.status, job.stage, job.error_code) == ("failed", "failed", "ValueError")
    # Nothing is left for the sensor to dispatch again.
    again = list(
        pending_climate_ingestions_sensor(dg.build_sensor_context(instance=instance))
    )
    assert len(again) == 1 and isinstance(again[0], dg.SkipReason)


def test_run_that_died_before_claiming_does_not_stay_queued(session_factory):
    # The Dagster run for this job failed without ever reaching the op (a code
    # location crash, a killed worker), so the row is still "queued". Without
    # the sensor's check its run_key is already spent and the job would sit
    # queued forever.
    job_id = _queue_pull(session_factory, with_bbox=True)
    instance = dg.DagsterInstance.ephemeral()
    (request,) = pending_climate_ingestions_sensor(
        dg.build_sensor_context(instance=instance)
    )
    run = instance.create_run_for_job(
        climate_ingestion_job,
        run_config=request.run_config,
        tags=request.tags,
    )
    instance.report_run_failed(run)

    requests = list(
        pending_climate_ingestions_sensor(dg.build_sensor_context(instance=instance))
    )

    assert requests == []
    job = _job(session_factory, job_id)
    assert (job.status, job.error_code) == ("failed", "CLIMATE_PULL_INTERRUPTED")
