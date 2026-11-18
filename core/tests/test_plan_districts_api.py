"""End-to-end tests for the Configure plan wizard's districts (step 3).

Through the FastAPI app and a real database (SQLite per test, with the two
PostGIS functions the map query uses registered as pass-through, as in
test_risk_map.py): a plan's districts ranked from the observed risk map,
the suggested ones selected until a choice is saved, the choice persisted
with each district's rank and share, and refusals for a district outside
the ranking, a lost write role and another user's plan.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, select

from chart.api.app import app
from chart.auth.schemas import CurrentUserContext
from chart.auth.service import require_current_user

from access_support import member
from chart.shared.db import session as db_session
from chart.shared.db.base import Base
from chart.shared.db.models import (
    ActiveModelAssignment,
    AdminUnit,
    AppGeography,
    CountryGeoConfig,
    DataLabel,
    Geography,
    ModelRelease,
    PlanDistrict,
    PredictionResult,
)

MP = "geo-in-madhya-pradesh"
LEAD = member("lead", "planning_lead", ["/india/madhya-pradesh"])
VIEWER_LEAD = member("lead", "viewer", ["/india/madhya-pradesh"])
OTHER = member("other", "planning_lead", ["/india/madhya-pradesh"])
SQUARE = json.dumps(
    {
        "type": "Polygon",
        "coordinates": [
            [[74.0, 21.0], [76.0, 21.0], [76.0, 23.0], [74.0, 23.0], [74.0, 21.0]]
        ],
    }
)
# Division: attributable share in tenths of a percent, or None without a model.
DIVISIONS = {"bhopal": 130, "rewa": 30, "sagar": 62, "indore": None}


@pytest.fixture
def factory(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'districts.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    # No published outlook here, so the observed risk map ranks the districts.
    monkeypatch.setenv("MODEL_CACHE_DIR", str(tmp_path / "models"))
    engine = db_session.get_engine(url)

    @event.listens_for(engine, "connect")
    def _geometry_stubs(dbapi_connection, _record):
        for name in ("ST_SimplifyPreserveTopology", "SimplifyPreserveTopology"):
            dbapi_connection.create_function(name, 2, lambda geometry, _tol: geometry)
        for name in ("ST_AsGeoJSON", "AsGeoJSON"):
            dbapi_connection.create_function(name, 1, lambda geometry: geometry)

    Base.metadata.create_all(engine)
    make = db_session.get_session_factory()
    with make() as session:
        for key, label in (("state", "State"), ("division", "Division")):
            session.add(
                CountryGeoConfig(country_code="IN", level_key=key, level_label=label)
            )
        geography = Geography(slug="in-mp", country="India", name="Madhya Pradesh")
        session.add(geography)
        session.add(
            AppGeography(
                id=MP,
                country_code="IN",
                level="state",
                level_label="State",
                name="Madhya Pradesh",
                path="/india/madhya-pradesh",
            )
        )
        session.add(
            ModelRelease(
                id="rel-lbw",
                module="prediction",
                outcome="lbw",
                version="v1",
                status="active",
                model_files=[],
                input_spec={},
            )
        )
        session.flush()
        for code, milli in DIVISIONS.items():
            session.add(
                AppGeography(
                    id=f"{MP}-{code}",
                    country_code="IN",
                    level="division",
                    level_label="Division",
                    name=code.title(),
                    parent_id=MP,
                    path=f"/india/madhya-pradesh/{code}",
                )
            )
            unit = AdminUnit(
                geography_id=geography.id,
                app_geography_id=f"{MP}-{code}",
                level="division",
                code=code,
                name=code.title(),
                boundary=SQUARE,
                bbox_west=74.0,
                bbox_south=21.0,
                bbox_east=76.0,
                bbox_north=23.0,
            )
            session.add(unit)
            session.flush()
            if milli is None:
                continue
            session.add(
                ActiveModelAssignment(
                    admin_unit_id=unit.id,
                    module="prediction",
                    outcome="lbw",
                    model_release_id="rel-lbw",
                )
            )
            session.add(
                PredictionResult(
                    admin_unit_id=unit.id,
                    outcome="lbw",
                    model_release_id="rel-lbw",
                    valid_month=date(2026, 8, 1),
                    scenario="seas5_ensemble",
                    horizon="m1",
                    pregnancy_window=1,
                    odds_ratio=1.15,
                    ci95_low=0.9,
                    ci95_high=1.4,
                    attributable_fraction_milli=milli,
                    on_training_support=True,
                    model_version="v1",
                    data_label=DataLabel.reanalysis,
                )
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


def draft(client: TestClient) -> str:
    response = client.post(
        "/saved-plans",
        json={
            "name": "MP heat plan",
            "geography_id": MP,
            "outcome": "lbw",
            "status": "draft",
            "start_date": date.today().isoformat(),
            "end_date": (date.today() + timedelta(days=200)).isoformat(),
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def test_districts_are_ranked_and_the_suggested_ones_preselected(as_user) -> None:
    client = as_user(LEAD)
    plan_id = draft(client)
    response = client.get(f"/saved-plans/{plan_id}/districts")
    assert response.status_code == 200, response.text
    body = response.json()
    # The risk map's latest result for each area, as the dashboard opens on.
    assert (body["source"], body["saved"]) == ("observed", False)
    assert [
        (area["name"], area["value_percent"], area["rank"], area["suggested"])
        for area in body["areas"]
    ] == [
        ("Bhopal", 13.0, 1, True),
        ("Sagar", 6.2, 2, True),
        ("Rewa", 3.0, 3, False),
        # No model: listed last, never suggested, so it is not drawn as safe.
        ("Indore", None, None, False),
    ]
    assert body["areas"][3]["missing_reason"] == "no_model"
    # Until a choice is saved, the suggested districts are the selection.
    assert [area["name"] for area in body["areas"] if area["selected"]] == [
        "Bhopal",
        "Sagar",
    ]


def test_a_chosen_set_is_saved_with_its_ranking(as_user, factory) -> None:
    client = as_user(LEAD)
    plan_id = draft(client)
    url = f"/saved-plans/{plan_id}/districts"
    saved = client.put(
        url, json={"geography_ids": [f"{MP}-rewa", f"{MP}-bhopal", f"{MP}-rewa"]}
    )
    assert saved.status_code == 200, saved.text
    body = saved.json()
    assert body["saved"] is True
    assert [area["name"] for area in body["areas"] if area["selected"]] == [
        "Bhopal",
        "Rewa",
    ]
    assert client.get(url).json() == body
    with factory() as session:
        rows = session.scalars(
            select(PlanDistrict)
            .where(PlanDistrict.plan_id == plan_id)
            .order_by(PlanDistrict.rank)
        ).all()
    assert [
        (row.geography_id, row.rank, row.value_percent, row.suggested, row.source)
        for row in rows
    ] == [
        (f"{MP}-bhopal", 1, 13.0, True, "observed"),
        (f"{MP}-rewa", 3, 3.0, False, "observed"),
    ]

    # Saving again replaces the choice rather than adding to it.
    again = client.put(url, json={"geography_ids": [f"{MP}-indore"]})
    assert again.status_code == 200, again.text
    with factory() as session:
        assert session.scalars(
            select(PlanDistrict.geography_id).where(PlanDistrict.plan_id == plan_id)
        ).all() == [f"{MP}-indore"]


def test_refused_choices_leave_the_saved_districts(as_user, factory) -> None:
    client = as_user(LEAD)
    plan_id = draft(client)
    url = f"/saved-plans/{plan_id}/districts"
    assert client.put(url, json={"geography_ids": [f"{MP}-sagar"]}).status_code == 200

    outside = client.put(url, json={"geography_ids": [f"{MP}-bhopal", "geo-ke"]})
    assert outside.status_code == 422
    assert outside.json()["error"] == "PLAN_DISTRICT_INVALID"
    assert client.put(url, json={"geography_ids": []}).status_code == 422

    other = as_user(OTHER)
    assert other.get(url).status_code == 404
    assert other.put(url, json={"geography_ids": [f"{MP}-bhopal"]}).status_code == 404

    viewer = as_user(VIEWER_LEAD)
    assert viewer.get(url).status_code == 200
    lost = viewer.put(url, json={"geography_ids": [f"{MP}-bhopal"]})
    assert lost.status_code == 403
    assert lost.json()["error"] == "CAPABILITY_NOT_ALLOWED"

    with factory() as session:
        assert session.scalars(
            select(PlanDistrict.geography_id).where(PlanDistrict.plan_id == plan_id)
        ).all() == [f"{MP}-sagar"]


def test_the_dashboards_district_is_preselected_among_all_of_them(as_user) -> None:
    # Opened on Rewa from the dashboard: the ranking still covers the state,
    # and Rewa (3%, not suggested) is ticked with the suggested ones.
    client = as_user(LEAD)
    response = client.post(
        "/saved-plans",
        json={
            "name": "Rewa heat plan",
            "geography_id": MP,
            "admin_unit_id": f"{MP}-rewa",
            "outcome": "lbw",
            "status": "draft",
            "start_date": date.today().isoformat(),
            "end_date": (date.today() + timedelta(days=200)).isoformat(),
        },
    )
    assert response.status_code == 201, response.text
    body = client.get(f"/saved-plans/{response.json()['id']}/districts").json()
    assert len(body["areas"]) == 4
    assert [area["name"] for area in body["areas"] if area["selected"]] == [
        "Bhopal",
        "Sagar",
        "Rewa",
    ]
