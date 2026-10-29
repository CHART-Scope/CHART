"""HTTP and identity fixtures for the disposable live application suites."""

import os
from pathlib import Path

import httpx
import pytest
from sqlalchemy import delete, select
from sqlalchemy.engine import make_url

from chart.shared.db.models import ClimateIngestionJob
from chart.shared.db.session import get_session_factory


@pytest.fixture(scope="module")
def client():
    with httpx.Client(base_url=os.environ["CHART_E2E_API"], timeout=90) as value:
        yield value


@pytest.fixture(scope="module")
def tokens():
    result = {}
    for username in ("india-planner", "kenya-planner", "district-planner", "denied"):
        response = httpx.post(
            os.environ["CHART_E2E_IDENTITY"]
            + "/realms/chart/protocol/openid-connect/token",
            data={
                "client_id": "chart-web",
                "grant_type": "password",
                "username": username,
                "password": os.environ["CHART_E2E_PASSWORD"],
            },
        )
        assert response.is_success, "Disposable identity login failed"
        result[username] = {
            "Authorization": "Bearer " + response.json()["access_token"]
        }
    return result


@pytest.fixture(scope="module")
def admin_headers():
    response = httpx.post(
        os.environ["CHART_E2E_IDENTITY"]
        + "/realms/chart/protocol/openid-connect/token",
        data={
            "client_id": "chart-web",
            "grant_type": "password",
            "username": "typography-admin",
            "password": os.environ["CHART_E2E_PASSWORD"],
        },
    )
    assert response.is_success, "Disposable administrator login failed"
    return {"Authorization": "Bearer " + response.json()["access_token"]}


@pytest.fixture
def jobs(client, admin_headers):
    # Never seed job lifecycle records against an ordinary development database.
    expected = make_url(os.environ["CHART_E2E_POSTGRES_URL"])
    actual = make_url(os.environ["DATABASE_URL"])
    evidence = Path(os.environ["CHART_E2E_EVIDENCE"])
    isolated = (
        expected.host == actual.host == "127.0.0.1"
        and expected.port == actual.port
        and expected.database == actual.database
        and expected.password == actual.password
        and (evidence / "run.json").is_file()
    )
    if not isolated:
        raise RuntimeError("Climate recovery requires the disposable E2E runner")
    factory = get_session_factory()
    with factory() as session:
        assert (
            session.scalar(
                select(ClimateIngestionJob.id).where(
                    ClimateIngestionJob.status.in_(("queued", "running"))
                )
            )
            is None
        ), "The disposable fixture must start without another live pull"
    created = []

    def queue():
        response = client.post(
            "/climate/ingestion-jobs",
            json={"country_code": "IN", "months": ["2026-08"]},
            headers=admin_headers,
        )
        assert response.status_code == 202, response.text
        job = response.json()
        if job["id"] not in created:
            created.append(job["id"])
        return job

    yield factory, queue

    with factory() as session:
        session.execute(
            delete(ClimateIngestionJob).where(ClimateIngestionJob.id.in_(created))
        )
        session.commit()
