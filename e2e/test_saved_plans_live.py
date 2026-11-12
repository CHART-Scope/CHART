"""Saved plans and the planning catalogue through real HTTP, identity and PostGIS."""

import os
import uuid

import pytest
from sqlalchemy import create_engine, text

FRAME = "geo-ke"
COUNTY = "geo-ke-kajiado"


@pytest.fixture
def created(client, tokens):
    """Plans made by a test, removed through the API afterwards."""

    plans: list[tuple[str, str]] = []
    yield plans
    for user, plan_id in plans:
        client.delete(f"/saved-plans/{plan_id}", headers=tokens[user])


def stored(plan_id):
    engine = create_engine(os.environ["DATABASE_URL"])
    with engine.connect() as connection:
        return (
            connection.execute(
                text(
                    "SELECT user_id, geography_id, admin_unit_id, outcome, choices, figure "
                    "FROM saved_plan WHERE id = :id"
                ),
                {"id": plan_id},
            )
            .mappings()
            .one_or_none()
        )


def save(client, tokens, created, user="kenya-planner", **body):
    payload = {
        "name": "E2E plan " + uuid.uuid4().hex[:6],
        "geography_id": FRAME,
        "admin_unit_id": COUNTY,
        "outcome": "lbw",
        "choices": {"view": "projection"},
        **body,
    }
    response = client.post("/saved-plans", json=payload, headers=tokens[user])
    if response.status_code == 201:
        created.append((user, response.json()["id"]))
    return response


@pytest.mark.parametrize(
    "geography", ["geo-ke", "geo-ke-kajiado", "geo-in-madhya-pradesh"]
)
def test_published_outcomes_name_their_health_domain(client, geography):
    # Regression: published outcomes were listed under "unspecified".
    response = client.get(
        "/model-catalog",
        params={"geography_id": geography, "include_descendants": "true"},
    )
    assert response.status_code == 200, response.text
    items = {item["outcome"]: item for item in response.json()["items"]}
    assert {"lbw", "under_5_mortality"} <= set(items)
    assert all(item["health_domain"] != "unspecified" for item in items.values())
    assert items["lbw"]["health_domain"] == "maternal_newborn_child_health"
    assert items["lbw"]["health_domain_label"] == "Maternal, newborn and child health"
    assert (
        items["under_5_mortality"]["health_domain"] == "maternal_newborn_child_health"
    )
    assert items["under_5_mortality"]["health_domain_label"] == (
        "Maternal, newborn and child health"
    )


def test_projection_plan_persists_the_dashboard_estimate(client, tokens, created):
    headers = tokens["kenya-planner"]
    outlook = client.get(
        f"/heat-outlook/{COUNTY}",
        params={"outcome": "lbw", "period": "2027-2031"},
        headers=headers,
    ).json()
    response = save(
        client,
        tokens,
        created,
        choices={"view": "projection", "period": "2027-2031"},
    )
    assert response.status_code == 201, response.text
    plan = response.json()
    heat = next(
        part
        for row in outlook["period_summary"]
        if row["period"] == "2027-2031"
        for part in row["parts"]
        if part["side"] == "heat"
    )
    figure = plan["figure"]
    assert figure["status"] == "captured"
    assert figure["release"] == outlook["release"]
    assert figure["percent"] == heat["value_percent"]
    assert figure["ratio"] == heat["ratio"]
    assert figure["heat_season_months"]
    # The API pins the choices it resolved, so the plan reopens the same view.
    assert plan["choices"]["scenario"] == outlook["scenario"]
    assert plan["choices"]["selector"] == outlook["selector"]
    assert plan["signals"]["timing"] == "before"
    ratio = heat["ratio"]
    expected = (
        "elevated"
        if ratio and ratio["low"] > 1
        else (
            "possible"
            if ratio and ratio["value"] > 1
            else "not_detected" if ratio else "possible"
        )
    )
    assert plan["signals"]["risk_level"] == expected

    row = stored(plan["id"])
    assert row["geography_id"] == FRAME and row["admin_unit_id"] == COUNTY
    assert row["outcome"] == "lbw"
    assert row["figure"]["percent"] == heat["value_percent"]
    assert row["choices"]["period"] == "2027-2031"

    listed = client.get("/saved-plans", headers=headers)
    assert listed.status_code == 200
    assert plan["id"] in [item["id"] for item in listed.json()["items"]]
    assert client.get(f"/saved-plans/{plan['id']}", headers=headers).json() == plan


def test_observed_plan_matches_validated_kajiado_month(client, tokens, created):
    response = save(
        client,
        tokens,
        created,
        choices={"view": "observed", "month": "2026-09"},
    )
    assert response.status_code == 201, response.text
    plan = response.json()
    assert plan["figure"]["status"] == "captured"
    # The supplied R validation case behind the observed dashboard.
    assert plan["figure"]["percent"] == pytest.approx(21.27, abs=0.01)
    assert plan["figure"]["when"] == "September 2026"
    assert plan["choices"]["month"] == "2026-09"
    # September falls outside Kenya's December-March heat season.
    assert plan["signals"]["timing"] == "before"


def test_plans_are_private_and_scoped(client, tokens, created):
    plan = save(client, tokens, created).json()
    other = tokens["india-planner"]
    assert plan["id"] not in [
        item["id"] for item in client.get("/saved-plans", headers=other).json()["items"]
    ]
    for method in ("get", "delete"):
        response = getattr(client, method)(f"/saved-plans/{plan['id']}", headers=other)
        assert response.status_code == 404
        assert response.json()["error"] == "SAVED_PLAN_NOT_FOUND"
    assert stored(plan["id"]) is not None

    denied = save(client, tokens, created, user="india-planner")
    assert denied.status_code == 403
    assert denied.json()["error"] == "GEOGRAPHY_OUT_OF_SCOPE"

    role = save(client, tokens, created, user="denied")
    assert role.status_code == 403
    assert role.json()["error"] == "ROLE_NOT_ALLOWED"
    assert client.get("/saved-plans").status_code == 401

    # A district-only planner may save their district on its parent's map.
    leaf = save(
        client,
        tokens,
        created,
        user="district-planner",
        geography_id="geo-in-madhya-pradesh",
        admin_unit_id="geo-in-madhya-pradesh-district-bhopal",
    )
    assert leaf.status_code == 201, leaf.text
    sibling = save(
        client,
        tokens,
        created,
        user="district-planner",
        geography_id="geo-in-madhya-pradesh",
        admin_unit_id="geo-in-madhya-pradesh-district-sehore",
    )
    assert sibling.status_code == 403


def test_invalid_plans_are_refused_without_writes(client, tokens, created):
    engine = create_engine(os.environ["DATABASE_URL"])
    with engine.connect() as connection:
        before = connection.scalar(text("SELECT count(*) FROM saved_plan"))
    outside = save(
        client, tokens, created, admin_unit_id="geo-in-madhya-pradesh-district-bhopal"
    )
    assert outside.status_code == 422
    assert outside.json()["error"] == "PLAN_AREA_INVALID"
    selection = save(
        client, tokens, created, choices={"view": "projection", "scenario": "ssp999"}
    )
    assert selection.status_code == 422
    assert selection.json()["error"] == "OUTLOOK_SELECTION_INVALID"
    assert save(client, tokens, created, name="   ").status_code == 422
    assert save(client, tokens, created, choices={"view": "both"}).status_code == 422
    missing = save(client, tokens, created, geography_id="geo-nowhere")
    assert missing.status_code == 404
    with engine.connect() as connection:
        assert connection.scalar(text("SELECT count(*) FROM saved_plan")) == before


def test_removing_a_plan_is_persisted_and_repeatable(client, tokens, created):
    headers = tokens["kenya-planner"]
    plan = save(client, tokens, created).json()
    assert (
        client.delete(f"/saved-plans/{plan['id']}", headers=headers).status_code == 204
    )
    assert stored(plan["id"]) is None
    assert client.get(f"/saved-plans/{plan['id']}", headers=headers).status_code == 404
    # A retried delete reports the plan as gone rather than failing differently.
    repeated = client.delete(f"/saved-plans/{plan['id']}", headers=headers)
    assert repeated.status_code == 404
