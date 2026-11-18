"""End-to-end tests for the Configure plan wizard's actions (step 4).

Through the FastAPI app, a real database (SQLite per test) and a real action
feed read from a file URL: the plan's heat actions ranked by the
recommendation rules against the plan's dates on the place's heat-season
calendar and its outcomes, the in-window ones selected until a choice is
saved, the choice persisted with its owner and due date, the plan then
saved, and refusals for an unknown action, another country's department, a
due date outside the plan, a lost write role and another user's plan.
"""

from __future__ import annotations

import json
import os
from collections.abc import Iterator
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from chart.actions import feed as action_feed
from chart.api.app import app
from chart.auth.schemas import CurrentUserContext
from chart.auth.service import require_current_user

from access_support import member
from chart.shared.db import session as db_session
from chart.shared.db.base import Base
from chart.shared.db.models import (
    AppGeography,
    CountryGeoConfig,
    Department,
    PlanAction,
    SavedPlan,
)

MP = "geo-in-mp"
LEAD = member("lead", "planning_lead", ["/india/madhya-pradesh"])
VIEWER_LEAD = member("lead", "viewer", ["/india/madhya-pradesh"])
OTHER = member("other", "planning_lead", ["/india/madhya-pradesh"])
# India's official calendar: before Nov-Feb, during Mar-Jun, after Jul-Oct.
START, END = date(2030, 1, 1), date(2030, 4, 30)


def action(id_, title, seasons, outcomes, cost, hazards=("Extreme heat",), **more):
    return {
        "id": id_,
        "title": title,
        "summary": f"{title}.",
        "hazards": list(hazards),
        "health_outcomes": list(outcomes),
        "seasons": list(seasons),
        "departments": ["Health"],
        "cost_level": cost,
        **more,
    }


FEED = {
    "schema_version": 1,
    "published_at": "2026-11-01T00:00:00Z",
    "source": "e2e",
    "actions": [
        action(
            "rec-review", "Review the season", ["after"], ["Low birth weight"], "Low"
        ),
        action(
            "rec-cool", "Cooling rooms", ["during"], ["Under-5 mortality"], "Medium"
        ),
        action(
            "rec-counsel",
            "Counsel pregnant women",
            ["before", "during"],
            ["Low birth weight"],
            "Low",
        ),
        action(
            "rec-flood", "Flood shelters", ["during"], [], "Low", hazards=["Flooding"]
        ),
        action("rec-kenya", "Kenya only", ["during"], [], "Low", countries=["KE"]),
    ],
}


@pytest.fixture
def factory(tmp_path, monkeypatch):
    feed_file = tmp_path / "actions.json"
    feed_file.write_text(json.dumps(FEED))
    monkeypatch.setenv("CHART_ACTIONS_URL", feed_file.as_uri())
    monkeypatch.setattr(action_feed, "_cache", None)
    url = os.getenv("CHART_E2E_DATABASE_URL") or f"sqlite:///{tmp_path / 'actions.db'}"
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
        for code, path in (("IN", "/india"), ("KE", "/kenya")):
            session.add(
                CountryGeoConfig(
                    country_code=code, level_key="country", level_label="Country"
                )
            )
            session.add(
                AppGeography(
                    id=f"geo-{code.lower()}",
                    country_code=code,
                    level="country",
                    level_label="Country",
                    name=code,
                    path=path,
                )
            )
        session.add(
            CountryGeoConfig(country_code="IN", level_key="state", level_label="State")
        )
        session.flush()
        session.add(
            AppGeography(
                id=MP,
                country_code="IN",
                level="state",
                level_label="State",
                name="Madhya Pradesh",
                parent_id="geo-in",
                path="/india/madhya-pradesh",
            )
        )
        session.add_all(
            [
                Department(id=1, country_code="IN", name="Health"),
                Department(id=2, country_code="IN", name="Labour"),
                Department(id=3, country_code="KE", name="Health (Kenya)"),
            ]
        )
        session.commit()
    return make


@pytest.fixture
def as_user(factory) -> Iterator:
    def sign_in(user: CurrentUserContext) -> TestClient:
        app.dependency_overrides[require_current_user] = lambda: user
        return TestClient(app)

    yield sign_in
    app.dependency_overrides.pop(require_current_user, None)


def draft(client: TestClient, outcomes=("lbw",)) -> str:
    plan = client.post(
        "/saved-plans",
        json={
            "name": "MP heat plan",
            "geography_id": MP,
            "outcome": "lbw",
            "status": "draft",
            "start_date": START.isoformat(),
            "end_date": END.isoformat(),
        },
    )
    assert plan.status_code == 201, plan.text
    plan_id = plan.json()["id"]
    assert (
        client.patch(
            f"/saved-plans/{plan_id}", json={"outcomes": list(outcomes)}
        ).status_code
        == 200
    )
    return plan_id


def test_actions_are_ranked_for_the_plans_window_and_outcomes(as_user) -> None:
    client = as_user(LEAD)
    plan_id = draft(client, outcomes=("lbw", "under_5_mortality"))
    response = client.get(f"/saved-plans/{plan_id}/actions")
    assert response.status_code == 200, response.text
    body = response.json()
    # January-April: before (Jan, Feb) and during (Mar, Apr) the heat season.
    assert body["phases"] == ["before", "during"]
    assert body["saved"] is False
    # Heat actions for India only; flooding and Kenya's are left out.
    assert [
        (item["id"], item["rank"], item["recommended"], item["selected"])
        for item in body["items"]
    ] == [
        ("rec-counsel", 1, True, True),  # season 4 + outcome 3 + low cost 2
        ("rec-cool", 2, True, True),  # season 4 + outcome 3 + medium cost 1
        ("rec-review", 3, False, False),  # outcome 3 + low cost 2; after is outside
    ]
    assert body["items"][0]["reasons"] == [
        "Fits before the heat season and during the heat season, inside the plan's dates.",
        "Targets low birth weight.",
        "Low cost.",
    ]
    assert body["departments"] == [
        {"id": 1, "name": "Health"},
        {"id": 2, "name": "Labour"},
    ]


def test_chosen_actions_are_saved_with_owners_and_the_plan_saved(
    as_user, factory
) -> None:
    client = as_user(LEAD)
    plan_id = draft(client)
    url = f"/saved-plans/{plan_id}/actions"
    saved = client.put(
        url,
        json={
            "items": [
                {
                    "action_id": "rec-review",
                    "owner_department_id": 2,
                    "due_date": "2030-04-15",
                },
                {"action_id": "rec-counsel", "owner_department_id": 1},
            ]
        },
    )
    assert saved.status_code == 200, saved.text
    body = saved.json()
    assert body["saved"] is True
    chosen = {item["id"]: item for item in body["items"] if item["selected"]}
    assert set(chosen) == {"rec-review", "rec-counsel"}
    assert chosen["rec-review"]["owner_department_id"] == 2
    assert chosen["rec-review"]["due_date"] == "2030-04-15"
    assert client.get(url).json() == body
    with factory() as session:
        rows = {
            row.action_id: row
            for row in session.scalars(
                select(PlanAction).where(PlanAction.plan_id == plan_id)
            )
        }
    assert set(rows) == {"rec-review", "rec-counsel"}
    assert rows["rec-review"].title == "Review the season"
    assert rows["rec-review"].seasons == ["after"]
    assert rows["rec-counsel"].due_date is None

    # The last step saves the draft.
    finished = client.patch(f"/saved-plans/{plan_id}", json={"status": "saved"})
    assert finished.status_code == 200, finished.text
    assert finished.json()["status"] == "saved"
    with factory() as session:
        assert session.get(SavedPlan, plan_id).status == "saved"
    assert (
        client.patch(f"/saved-plans/{plan_id}", json={"status": "draft"}).status_code
        == 422
    )


def test_refused_actions_leave_the_saved_choice(as_user, factory) -> None:
    client = as_user(LEAD)
    plan_id = draft(client)
    url = f"/saved-plans/{plan_id}/actions"
    assert (
        client.put(url, json={"items": [{"action_id": "rec-cool"}]}).status_code == 200
    )
    for item, code in (
        ({"action_id": "rec-flood"}, "PLAN_ACTION_INVALID"),
        ({"action_id": "rec-kenya"}, "PLAN_ACTION_INVALID"),
        (
            {"action_id": "rec-cool", "owner_department_id": 3},
            "PLAN_ACTION_OWNER_INVALID",
        ),
        (
            {"action_id": "rec-cool", "due_date": "2031-01-01"},
            "PLAN_ACTION_DUE_INVALID",
        ),
    ):
        refused = client.put(url, json={"items": [item]})
        assert refused.status_code == 422, item
        assert refused.json()["error"] == code
    assert client.put(url, json={"items": []}).status_code == 422
    assert (
        as_user(OTHER).put(url, json={"items": [{"action_id": "rec-cool"}]}).status_code
        == 404
    )
    lost = as_user(VIEWER_LEAD).put(url, json={"items": [{"action_id": "rec-cool"}]})
    assert lost.status_code == 403
    assert lost.json()["error"] == "CAPABILITY_NOT_ALLOWED"
    with factory() as session:
        rows = session.scalars(
            select(PlanAction.action_id).where(PlanAction.plan_id == plan_id)
        ).all()
    assert rows == ["rec-cool"]
