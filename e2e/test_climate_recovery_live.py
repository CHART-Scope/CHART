"""Recover interrupted climate pulls through real HTTP, PostGIS and Dagster.

The runner supplies disposable services. Persisted Dagster states model a worker
exiting after claiming a job; the real sensor reconciles those records without
starting a Copernicus download or replacing any application dependency.
"""

from datetime import datetime, timedelta, timezone

import dagster as dg
import pytest

from chart.climate.ingestion_jobs import claim_job
from chart.shared.db.models import ClimateIngestionJob
from chart_pipeline.definitions import (
    climate_ingestion_job,
    pending_climate_ingestions_sensor,
)

ENDPOINT = "/climate/ingestion-jobs"
REQUEST = {"country_code": "IN", "months": ["2026-08"]}


def dispatch(instance):
    with dg.build_sensor_context(instance=instance) as context:
        return list(pending_climate_ingestions_sensor(context))


def read_job(client, admin_headers, job_id):
    response = client.get(
        ENDPOINT, params={"country_code": "IN"}, headers=admin_headers
    )
    assert response.status_code == 200, response.text
    return next(job for job in response.json() if job["id"] == job_id)


@pytest.mark.parametrize("job_status", ["running", "queued"])
@pytest.mark.parametrize("run_status", ["FAILURE", "CANCELED"])
def test_terminal_run_releases_country_for_retry(
    client, admin_headers, jobs, tmp_path, job_status, run_status
):
    factory, queue = jobs
    queued = queue()
    with dg.DagsterInstance.local_temp(str(tmp_path)) as instance:
        requests = dispatch(instance)
        assert len(requests) == 1
        request = requests[0]
        assert isinstance(request, dg.RunRequest)
        assert request.tags["climate_ingestion_job_id"] == str(queued["id"])
        run = instance.create_run_for_job(
            climate_ingestion_job,
            run_config=request.run_config,
            tags=request.tags,
            status=dg.DagsterRunStatus.STARTED,
        )
        if job_status == "running":
            with factory() as session:
                claimed = claim_job(session, queued["id"], dagster_run_id=run.run_id)
                assert claimed is not None
                session.commit()
        before = read_job(client, admin_headers, queued["id"])
        assert before["status"] == job_status
        assert queue()["id"] == queued["id"], "Live pulls must still deduplicate"

        if run_status == "FAILURE":
            instance.report_run_failed(run)
        else:
            instance.report_run_canceled(run)
        # Reopen the instance to ensure reconciliation reads durable run state.
        with dg.DagsterInstance.from_ref(instance.get_ref()) as restarted:
            assert restarted.get_run_by_id(run.run_id).status.value == run_status
            requests = dispatch(restarted)
            assert not any(isinstance(item, dg.RunRequest) for item in requests)

        failed = read_job(client, admin_headers, queued["id"])
        assert (failed["status"], failed["stage"], failed["error_code"]) == (
            "failed",
            "failed",
            "CLIMATE_PULL_INTERRUPTED",
        )
        with factory() as session:
            saved = session.get(ClimateIngestionJob, queued["id"])
            assert saved.status == "failed"
            assert saved.error_code == "CLIMATE_PULL_INTERRUPTED"
            if job_status == "running":
                assert saved.dagster_run_id == run.run_id
        retry = queue()
        assert retry["id"] != queued["id"]
        assert retry["status"] == "queued"
        assert retry["error_code"] is None
        retry_requests = dispatch(instance)
        assert len(retry_requests) == 1
        assert isinstance(retry_requests[0], dg.RunRequest)
        assert retry_requests[0].tags["climate_ingestion_job_id"] == str(retry["id"])
        assert retry_requests[0].run_key != request.run_key
        assert read_job(client, admin_headers, queued["id"])["status"] == "failed"


def test_active_run_is_not_failed_for_age_or_duplicated(
    client, admin_headers, jobs, tmp_path
):
    factory, queue = jobs
    queued = queue()
    with dg.DagsterInstance.local_temp(str(tmp_path)) as instance:
        (request,) = dispatch(instance)
        assert isinstance(request, dg.RunRequest)
        run = instance.create_run_for_job(
            climate_ingestion_job,
            run_config=request.run_config,
            tags=request.tags,
            status=dg.DagsterRunStatus.STARTED,
        )
        with factory() as session:
            claimed = claim_job(session, queued["id"], dagster_run_id=run.run_id)
            assert claimed is not None
            claimed.updated_at = datetime.now(timezone.utc) - timedelta(days=2)
            session.commit()
        # A later terminal record with the same dispatch tag must not replace
        # the still-active run that owns the application job.
        unrelated = instance.create_run_for_job(
            climate_ingestion_job,
            run_config=request.run_config,
            tags=request.tags,
        )
        instance.report_run_failed(unrelated)
        for _ in range(2):
            assert not any(
                isinstance(item, dg.RunRequest) for item in dispatch(instance)
            )
            active = read_job(client, admin_headers, queued["id"])
            assert active["status"] == "running"
            assert active["error_code"] is None
            assert active["completed_at"] is None
            assert queue()["id"] == queued["id"]
        with factory() as session:
            saved = session.get(ClimateIngestionJob, queued["id"])
            assert saved.status == "running"
            assert saved.dagster_run_id == run.run_id


def test_ingestion_job_controls_require_real_administrator(client, tokens):
    for headers, status in (({}, 401), (tokens["india-planner"], 403)):
        assert client.get(ENDPOINT, headers=headers).status_code == status
        assert (
            client.post(ENDPOINT, json=REQUEST, headers=headers).status_code == status
        )
