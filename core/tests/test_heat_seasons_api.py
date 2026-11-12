"""End-to-end tests for heat-season calendars (Settings > Heat seasons).

Through the FastAPI app and a real database (SQLite per test, or a migrated
PostgreSQL/PostGIS database when ``CHART_E2E_DATABASE_URL`` is set): the
official default, saving a state's calendar and its inheritance by a
district, invalid cycles, reset, denied roles and scopes, and the audit trail.
"""

from __future__ import annotations

import os
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from chart.api.app import app
from chart.auth.schemas import CurrentUserContext
from chart.auth.service import require_current_user

from access_support import member
from chart.shared.db import session as db_session
from chart.shared.db.base import Base
from chart.shared.db.models import (
    AppGeography,
    AuditEventRecord,
    CountryGeoConfig,
    HeatSeasonSetting,
)

INDIA, MP, SHEOPUR, KENYA = "geo-in", "geo-in-mp", "geo-in-mp-sheopur", "geo-ke"


LEAD = member("lead", "workspace_admin", ["/india"])
OFFICER = member("officer", "planning_lead", ["/india"])
KENYA_LEAD = member("kenya-lead", "workspace_admin", ["/kenya"])


@pytest.fixture
def factory(tmp_path, monkeypatch):
    url = os.getenv("CHART_E2E_DATABASE_URL") or f"sqlite:///{tmp_path / 'seasons.db'}"
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
        for code, key, label in (
            ("IN", "country", "Country"),
            ("IN", "state", "State"),
            ("IN", "district", "District"),
            ("KE", "country", "Country"),
        ):
            session.add(
                CountryGeoConfig(country_code=code, level_key=key, level_label=label)
            )
        session.flush()
        for id_, code, level, label, name, parent, path in (
            (INDIA, "IN", "country", "Country", "India", None, "/india"),
            (
                MP,
                "IN",
                "state",
                "State",
                "Madhya Pradesh",
                INDIA,
                "/india/madhya-pradesh",
            ),
            (
                SHEOPUR,
                "IN",
                "district",
                "District",
                "Sheopur",
                MP,
                "/india/madhya-pradesh/sheopur",
            ),
            (KENYA, "KE", "country", "Country", "Kenya", None, "/kenya"),
        ):
            session.add(
                AppGeography(
                    id=id_,
                    country_code=code,
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


def test_official_season_is_the_default_and_children_inherit_it(as_user) -> None:
    client = as_user(LEAD)
    items = client.get("/heat-seasons").json()["items"]
    # Only the user's scope, parents before children.
    assert [item["geography_id"] for item in items] == [INDIA, MP, SHEOPUR]
    assert [item["depth"] for item in items] == [0, 1, 2]
    india = items[0]
    # IMD's March-June season with four months of preparation.
    assert (india["months"], india["state"], india["own"]) == (
        "bbddddaaaabb",
        "official",
        None,
    )
    assert india["source"] == "India Meteorological Department"
    assert items[2]["state"] == "official"
    assert items[2]["months"] == "bbddddaaaabb"


def test_a_saved_state_calendar_is_inherited_and_audited(as_user, factory) -> None:
    client = as_user(LEAD)
    response = client.put(
        f"/heat-seasons/{MP}",
        json={"months": "bbbddddaaaao", "source": "MP heat action plan"},
    )
    assert response.status_code == 200, response.text
    saved = response.json()
    assert (saved["state"], saved["own"], saved["months"]) == (
        "custom",
        "bbbddddaaaao",
        "bbbddddaaaao",
    )

    district = client.get(f"/heat-seasons/{SHEOPUR}").json()
    assert (district["state"], district["inherited_from"], district["months"]) == (
        "inherited",
        "Madhya Pradesh",
        "bbbddddaaaao",
    )
    assert district["source"] == "MP heat action plan"
    # The country keeps its official season.
    assert client.get(f"/heat-seasons/{INDIA}").json()["state"] == "official"

    # Saving again replaces the row rather than adding one.
    assert (
        client.put(f"/heat-seasons/{MP}", json={"months": "bbddddaaaabb"}).status_code
        == 200
    )
    with factory() as session:
        rows = session.scalars(select(HeatSeasonSetting)).all()
        assert [
            (row.geography_id, row.months, row.updated_by_user_id) for row in rows
        ] == [(MP, "bbddddaaaabb", "lead")]
        events = session.scalars(
            select(AuditEventRecord).order_by(AuditEventRecord.id)
        ).all()
        assert [
            (e.event_type, e.payload["before"], e.payload["after"]) for e in events
        ] == [
            ("heat_season_changed", None, "bbbddddaaaao"),
            ("heat_season_changed", "bbbddddaaaao", "bbddddaaaabb"),
        ]


def test_reset_drops_the_calendar_so_the_place_inherits_again(as_user, factory) -> None:
    client = as_user(LEAD)
    client.put(f"/heat-seasons/{MP}", json={"months": "bbbddddaaaao"})
    client.put(f"/heat-seasons/{SHEOPUR}", json={"months": "bdddddaaaabb"})

    reset = client.delete(f"/heat-seasons/{SHEOPUR}")
    assert reset.status_code == 200
    assert (reset.json()["state"], reset.json()["inherited_from"]) == (
        "inherited",
        "Madhya Pradesh",
    )
    with factory() as session:
        assert session.get(HeatSeasonSetting, SHEOPUR) is None
    # Resetting a place with nothing saved changes nothing.
    assert client.delete(f"/heat-seasons/{SHEOPUR}").status_code == 200


@pytest.mark.parametrize(
    "months",
    [
        "bdbdddaaaaoo",  # preparation split in two
        "aaaaaaaaaaaa",  # no season
        "bbddddaaaabX",  # not a phase letter
        "bbdddd",  # too short
        "bbaaddddoooo",  # after before during
    ],
)
def test_an_invalid_cycle_is_refused_and_nothing_saved(
    as_user, factory, months
) -> None:
    response = as_user(LEAD).put(f"/heat-seasons/{MP}", json={"months": months})
    assert response.status_code == 422
    with factory() as session:
        assert session.scalars(select(HeatSeasonSetting)).all() == []


def test_planning_leads_may_read_but_not_change_calendars(as_user, factory) -> None:
    client = as_user(OFFICER)
    assert client.get(f"/heat-seasons/{MP}").status_code == 200
    for response in (
        client.put(f"/heat-seasons/{MP}", json={"months": "bbddddaaaabb"}),
        client.delete(f"/heat-seasons/{MP}"),
    ):
        assert (response.status_code, response.json()["error"]) == (
            403,
            "CAPABILITY_NOT_ALLOWED",
        )
    with factory() as session:
        assert session.scalars(select(AuditEventRecord)).all() == []


def test_places_outside_the_scope_are_hidden_and_refused(as_user) -> None:
    client = as_user(KENYA_LEAD)
    assert [
        item["geography_id"] for item in client.get("/heat-seasons").json()["items"]
    ] == [KENYA]
    for response in (
        client.get(f"/heat-seasons/{MP}"),
        client.put(f"/heat-seasons/{MP}", json={"months": "bbddddaaaabb"}),
    ):
        assert (response.status_code, response.json()["error"]) == (
            403,
            "GEOGRAPHY_NOT_ALLOWED",
        )
    assert client.get("/heat-seasons/geo-nowhere").status_code == 404


def test_calendars_require_sign_in() -> None:
    anonymous = TestClient(app)
    assert anonymous.get("/heat-seasons").status_code == 401
    assert (
        anonymous.put(
            f"/heat-seasons/{MP}", json={"months": "bbddddaaaabb"}
        ).status_code
        == 401
    )
