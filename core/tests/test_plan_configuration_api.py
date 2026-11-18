"""End-to-end tests for the Configure plan wizard's first two steps.

Through the FastAPI app and a real database (SQLite per test, or a migrated
PostgreSQL/PostGIS database when ``CHART_E2E_DATABASE_URL`` is set): a draft
started with its dates, renamed and given its outcomes, each step persisted;
invalid timelines, hazards and outcomes refused without writes; another
user's plan, a lost write role and a place outside the planner's scope.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from chart.api.app import app
from chart.auth.schemas import CurrentUserContext
from chart.auth.service import require_current_user

from access_support import member
from chart.shared.db import session as db_session
from chart.shared.db.base import Base
from chart.shared.db.models import AppGeography, CountryGeoConfig, SavedPlan

INDIA, MP, SHEOPUR = "geo-in", "geo-in-mp", "geo-in-mp-sheopur"

LEAD = member("lead", "planning_lead", ["/india/madhya-pradesh"])
READ_ONLY_LEAD = member("lead", "viewer", ["/india/madhya-pradesh"])
OTHER = member("other", "planning_lead", ["/india/madhya-pradesh"])
KENYA = member("kenya", "planning_lead", ["/kenya"])
TODAY = date.today()


@pytest.fixture
def factory(tmp_path, monkeypatch):
    url = os.getenv("CHART_E2E_DATABASE_URL") or f"sqlite:///{tmp_path / 'plans.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    engine = db_session.get_engine(url)
    if url.startswith("postgresql"):
        with engine.begin() as connection:
            for table in reversed(Base.metadata.sorted_tables):
                connection.execute(table.delete())
    else:
        Base.metadata.create_all(engine)
    make = db_session.get_session_factory()
    with make() as session:
        for key, label in (
            ("country", "Country"),
            ("state", "State"),
            ("district", "District"),
        ):
            session.add(
                CountryGeoConfig(country_code="IN", level_key=key, level_label=label)
            )
        session.flush()
        for id_, level, label, name, parent, path in (
            (INDIA, "country", "Country", "India", None, "/india"),
            (MP, "state", "State", "Madhya Pradesh", INDIA, "/india/madhya-pradesh"),
            (
                SHEOPUR,
                "district",
                "District",
                "Sheopur",
                MP,
                "/india/madhya-pradesh/sheopur",
            ),
        ):
            session.add(
                AppGeography(
                    id=id_,
                    country_code="IN",
                    level=level,
                    level_label=label,
                    name=name,
                    parent_id=parent,
                    path=path,
                )
            )
            session.flush()
        session.commit()
    return make


@pytest.fixture
def as_user(factory) -> Iterator:
    def sign_in(user: CurrentUserContext) -> TestClient:
        app.dependency_overrides[require_current_user] = lambda: user
        return TestClient(app)

    yield sign_in
    app.dependency_overrides.pop(require_current_user, None)


def stored(factory, plan_id: str) -> SavedPlan | None:
    with factory() as session:
        plan = session.get(SavedPlan, plan_id)
        if plan is not None:
            session.expunge(plan)
        return plan


def start_draft(client: TestClient, **body) -> dict:
    payload = {
        "name": "Madhya Pradesh heat-health plan",
        "geography_id": MP,
        "outcome": "lbw",
        "status": "draft",
        "start_date": TODAY.isoformat(),
        "end_date": (TODAY + timedelta(days=364)).isoformat(),
        **body,
    }
    response = client.post("/saved-plans", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def test_a_draft_keeps_each_wizard_step(as_user, factory) -> None:
    client = as_user(LEAD)
    plan = start_draft(client)
    assert plan["status"] == "draft"
    assert (plan["start_date"], plan["end_date"]) == (
        TODAY.isoformat(),
        (TODAY + timedelta(days=364)).isoformat(),
    )
    # The dashboard outcome it was opened on is the first outcome addressed.
    assert (plan["hazard"], plan["outcomes"]) == ("extreme_heat", ["lbw"])
    # With no dashboard view sent, the projection view is captured as usual.
    assert plan["choices"]["view"] == "projection"

    # Step 1 again: a new name and the heat season only.
    step_one = client.patch(
        f"/saved-plans/{plan['id']}",
        json={
            "name": "  MP   heat season plan ",
            "start_date": (TODAY + timedelta(days=30)).isoformat(),
            "end_date": (TODAY + timedelta(days=150)).isoformat(),
        },
    )
    assert step_one.status_code == 200, step_one.text
    assert step_one.json()["name"] == "MP heat season plan"

    # Step 2: both outcomes, a repeat ignored.
    step_two = client.patch(
        f"/saved-plans/{plan['id']}",
        json={
            "hazard": "extreme_heat",
            "outcomes": ["lbw", "under_5_mortality", "lbw"],
        },
    )
    assert step_two.status_code == 200, step_two.text
    body = step_two.json()
    assert body["outcomes"] == ["lbw", "under_5_mortality"]
    # Fields a step leaves out keep their values.
    assert body["start_date"] == (TODAY + timedelta(days=30)).isoformat()
    assert body["status"] == "draft"

    row = stored(factory, plan["id"])
    assert row is not None
    assert row.name == "MP heat season plan"
    assert row.outcomes == ["lbw", "under_5_mortality"]
    assert row.start_date == TODAY + timedelta(days=30)
    assert row.end_date == TODAY + timedelta(days=150)
    assert client.get(f"/saved-plans/{plan['id']}").json() == body
    listed = client.get("/saved-plans").json()["items"]
    assert [(item["id"], item["status"]) for item in listed] == [(plan["id"], "draft")]


def test_a_dashboard_save_is_saved_with_its_own_outcome(as_user) -> None:
    plan = as_user(LEAD).post(
        "/saved-plans",
        json={
            "name": "Sheopur view",
            "geography_id": MP,
            "admin_unit_id": SHEOPUR,
            "outcome": "under_5_mortality",
            "choices": {"view": "projection"},
        },
    )
    assert plan.status_code == 201, plan.text
    body = plan.json()
    assert body["status"] == "saved"
    assert (body["start_date"], body["end_date"]) == (None, None)
    assert body["outcomes"] == ["under_5_mortality"]


@pytest.mark.parametrize(
    ("start", "end", "code"),
    [
        (TODAY, TODAY - timedelta(days=1), "PLAN_TIMELINE_INVALID"),
        (TODAY, None, "PLAN_TIMELINE_INVALID"),
        (TODAY - timedelta(days=7), TODAY + timedelta(days=30), "PLAN_START_IN_PAST"),
        # 24 months from the start is one day too many.
        (date(2030, 1, 31), date(2032, 1, 31), "PLAN_TIMELINE_TOO_LONG"),
    ],
)
def test_invalid_timelines_are_refused_without_writes(
    as_user, factory, start, end, code
) -> None:
    client = as_user(LEAD)
    plan = start_draft(client)
    response = client.patch(
        f"/saved-plans/{plan['id']}",
        json={
            "start_date": start.isoformat(),
            "end_date": end.isoformat() if end else None,
        },
    )
    assert response.status_code == 422
    assert response.json()["error"] == code
    row = stored(factory, plan["id"])
    assert (row.start_date, row.end_date) == (
        TODAY,
        TODAY + timedelta(days=364),
    )
    created = client.post(
        "/saved-plans",
        json={
            "name": "Refused",
            "geography_id": MP,
            "outcome": "lbw",
            "status": "draft",
            "start_date": start.isoformat(),
            "end_date": end.isoformat() if end else None,
        },
    )
    assert created.status_code == 422
    assert created.json()["error"] == code
    assert len(client.get("/saved-plans").json()["items"]) == 1


def test_the_longest_plan_ends_the_day_before_24_months(as_user) -> None:
    client = as_user(LEAD)
    plan = start_draft(client)
    response = client.patch(
        f"/saved-plans/{plan['id']}",
        json={"start_date": "2030-01-31", "end_date": "2032-01-30"},
    )
    assert response.status_code == 200, response.text


def test_hazards_and_outcomes_without_a_model_are_refused(as_user, factory) -> None:
    client = as_user(LEAD)
    plan = start_draft(client)
    url = f"/saved-plans/{plan['id']}"
    flooding = client.patch(url, json={"hazard": "flood"})
    assert flooding.status_code == 422
    assert flooding.json()["error"] == "PLAN_HAZARD_UNAVAILABLE"
    unknown = client.patch(url, json={"outcomes": ["lbw", "asthma"]})
    assert unknown.status_code == 422
    assert unknown.json()["error"] == "PLAN_OUTCOME_INVALID"
    # At least one outcome, and a step must change something.
    assert client.patch(url, json={"outcomes": []}).status_code == 422
    assert client.patch(url, json={}).status_code == 422
    assert client.patch(url, json={"name": None}).status_code == 422
    assert client.patch(url, json={"name": "   "}).status_code == 422
    row = stored(factory, plan["id"])
    assert (row.hazard, row.outcomes, row.name) == (
        "extreme_heat",
        ["lbw"],
        "Madhya Pradesh heat-health plan",
    )


def test_only_the_owner_with_plans_write_changes_a_plan(as_user, factory) -> None:
    plan = start_draft(as_user(LEAD))
    url = f"/saved-plans/{plan['id']}"

    other = as_user(OTHER).patch(url, json={"name": "Taken over"})
    assert other.status_code == 404
    assert other.json()["error"] == "SAVED_PLAN_NOT_FOUND"

    # The owner, since made a viewer, may still read it but not change it.
    read_only = as_user(READ_ONLY_LEAD)
    assert read_only.get(url).status_code == 200
    lost = read_only.patch(url, json={"name": "Renamed"})
    assert lost.status_code == 403
    assert lost.json()["error"] == "CAPABILITY_NOT_ALLOWED"

    assert stored(factory, plan["id"]).name == "Madhya Pradesh heat-health plan"

    outside = as_user(KENYA).post(
        "/saved-plans",
        json={
            "name": "Not mine",
            "geography_id": MP,
            "outcome": "lbw",
            "status": "draft",
            "start_date": TODAY.isoformat(),
            "end_date": (TODAY + timedelta(days=30)).isoformat(),
        },
    )
    assert outside.status_code == 403
    assert outside.json()["error"] == "GEOGRAPHY_OUT_OF_SCOPE"
