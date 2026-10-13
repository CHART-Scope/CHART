"""Route tests for per-country model settings.

Kenya's options come from published outlook tables (the fixtures of
``test_heat_outlook_api``); India's from an active live LBW release seeded
into SQLite. Each test changes settings through the API and reads the effect
back through the outlook and planning endpoints that apply them.
"""

from __future__ import annotations

from contextlib import nullcontext
from datetime import date, datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from chart.api.app import app
from chart.audit import service as audit_service
from chart.auth.service import require_current_user
from chart.climate.schemas import PredictRequest
from chart.heat_outlook import routes as outlook_routes
from chart.climate.service import (
    ClimateServiceError,
    get_planning_options,
    require_enabled_by_settings,
)
from chart.shared.db.models import (
    ActiveModelAssignment,
    AdminUnit,
    AppGeography,
    AppUser,
    AuditEventRecord,
    CountryGeoConfig,
    Geography,
    ModelAreaMapping,
    ModelDisplaySetting,
    ModelRelease,
)
import test_heat_outlook_api as outlook_tests

KAJIADO = outlook_tests.KAJIADO
_user = outlook_tests._user
# The outlook suite's fixtures: published Kenya tables and a settings store.
client = outlook_tests.client
settings_db = outlook_tests.settings_db

NOW = datetime(2026, 7, 22, 12, 0, tzinfo=timezone.utc)


def _lbw(**overrides) -> dict:
    return {
        "selectors": ["P"],
        "default_selector": "P",
        "scenarios": ["ssp585"],
        "default_scenario": "ssp585",
        "data_modes": ["projection"],
        **overrides,
    }


def _outlook(client: TestClient, query: str = ""):
    return client.get(f"/heat-outlook/{KAJIADO}?outcome=lbw{query}")


def test_settings_require_sign_in() -> None:
    anonymous = TestClient(app)
    assert anonymous.get("/model-settings").status_code == 401
    assert anonymous.put("/model-settings/KE/lbw", json=_lbw()).status_code == 401


def test_kenya_lbw_defaults_to_whole_pregnancy_only(client, monkeypatch) -> None:
    # The map's shapes need PostGIS; a refused selection never reaches them.
    monkeypatch.setattr(outlook_routes, "get_session_factory", lambda: nullcontext)

    body = client.get("/model-settings?country=KE&outcome=lbw").json()

    assert [o["code"] for o in body["available"]["selectors"]] == [
        "P",
        "T1",
        "T2",
        "T3",
    ]
    assert body["available"]["selector_label"] == "Pregnancy windows"
    assert body["is_default"] is True
    assert body["settings"] == _lbw()

    outlook = _outlook(client).json()
    assert [o["code"] for o in outlook["selectors"]] == ["P"]
    assert outlook["selector"] == "P"
    for path in (f"/heat-outlook/{KAJIADO}", "/heat-outlook/geo-ke/map"):
        response = client.get(f"{path}?outcome=lbw&selector=T1")
        assert (response.status_code, response.json()["error"]) == (
            422,
            "OUTLOOK_SELECTION_INVALID",
        )


def test_enabling_a_window_is_stored_audited_and_offered(
    client, settings_db, monkeypatch
) -> None:
    response = client.put(
        "/model-settings/ke/lbw",
        json=_lbw(selectors=["T1", "P"], default_selector="T1"),
    )

    assert response.status_code == 200, response.text
    saved = response.json()
    # Stored in the order the tables publish, whatever order was sent.
    assert saved["settings"]["selectors"] == ["P", "T1"]
    assert (saved["is_default"], saved["updated_by_user_id"]) == (False, "planner")

    outlook = _outlook(client).json()
    assert [o["code"] for o in outlook["selectors"]] == ["P", "T1"]
    assert outlook["selector"] == "T1"
    assert _outlook(client, "&selector=T2").status_code == 422

    with settings_db() as session:
        row = session.scalar(select(ModelDisplaySetting))
        assert (row.country_code, row.outcome) == ("KE", "lbw")
        assert session.get(AppUser, "planner") is not None
        event = session.scalar(select(AuditEventRecord))
        assert event.event_type == "model_settings_changed"
        assert event.geography_id == "geo-ke"
        assert event.payload["before"]["selectors"] == ["P"]
        assert event.payload["after"]["selectors"] == ["P", "T1"]
        assert event.payload["after"]["default_selector"] == "T1"

    # The change shows in the user's own activity log.
    monkeypatch.setattr(audit_service, "get_session_factory", lambda: settings_db)
    activity = client.get("/audit/events").json()["items"]
    assert [item["event_type"] for item in activity] == ["model_settings_changed"]


@pytest.mark.parametrize(
    ("values", "error"),
    [
        (_lbw(selectors=["P", "T9"]), "MODEL_SETTINGS_OPTION_UNKNOWN"),
        # Kenya has no live model here, so observed months cannot be added.
        (_lbw(data_modes=["projection", "observed"]), "MODEL_SETTINGS_OPTION_UNKNOWN"),
        (
            _lbw(scenarios=["ssp245"], default_scenario="ssp245"),
            "MODEL_SETTINGS_OPTION_UNKNOWN",
        ),
        (_lbw(selectors=[]), "MODEL_SETTINGS_OPTION_REQUIRED"),
        (_lbw(data_modes=[]), "MODEL_SETTINGS_OPTION_REQUIRED"),
        (_lbw(default_selector="T1"), "MODEL_SETTINGS_DEFAULT_NOT_ENABLED"),
        (_lbw(default_scenario=None), "MODEL_SETTINGS_DEFAULT_REQUIRED"),
    ],
)
def test_settings_may_only_narrow(client, settings_db, values, error) -> None:
    response = client.put("/model-settings/KE/lbw", json=values)

    assert (response.status_code, response.json().get("error")) == (422, error)
    with settings_db() as session:
        assert session.scalar(select(ModelDisplaySetting)) is None
        assert session.scalar(select(AuditEventRecord)) is None


def test_unknown_fields_and_half_queries_are_refused(client) -> None:
    assert client.put("/model-settings/KE/lbw", json=_lbw(extra=1)).status_code == 422
    assert client.get("/model-settings?country=KE").status_code == 422
    assert client.get("/model-settings?country=FR&outcome=lbw").status_code == 404


def test_under_five_offers_every_age_group_and_can_drop_one(client) -> None:
    body = client.get("/model-settings?country=KE&outcome=under_5_mortality").json()
    assert body["settings"]["selectors"] == ["neonatal", "postneonatal"]
    assert body["settings"]["default_selector"] == "postneonatal"

    response = client.put(
        "/model-settings/KE/under_5_mortality",
        json={
            **body["settings"],
            "selectors": ["postneonatal"],
        },
    )
    assert response.status_code == 200, response.text
    outlook = client.get(f"/heat-outlook/{KAJIADO}?outcome=under_5_mortality").json()
    assert [o["code"] for o in outlook["selectors"]] == ["postneonatal"]
    neonatal = client.get(
        f"/heat-outlook/{KAJIADO}?outcome=under_5_mortality&selector=neonatal"
    )
    assert neonatal.status_code == 422


def test_settings_are_scoped_to_countries_the_user_can_read(client) -> None:
    items = client.get("/model-settings").json()["items"]
    assert [(i["country_code"], i["outcome"]) for i in items] == [
        ("KE", "lbw"),
        ("KE", "under_5_mortality"),
    ]

    app.dependency_overrides[require_current_user] = lambda: _user(
        geography_scopes=["/india"]
    )
    denied = client.get("/model-settings?country=KE&outcome=lbw")
    assert (denied.status_code, denied.json()["error"]) == (
        403,
        "GEOGRAPHY_OUT_OF_SCOPE",
    )
    assert client.put("/model-settings/KE/lbw", json=_lbw()).status_code == 403
    assert client.get("/model-settings").json()["items"] == []


@pytest.fixture
def india(client, settings_db):
    """India with an active live LBW release for Madhya Pradesh."""

    with settings_db() as session:
        session.add_all(
            [
                CountryGeoConfig(
                    country_code="IN", level_key="country", level_label="Country"
                ),
                CountryGeoConfig(
                    country_code="IN", level_key="state", level_label="State"
                ),
            ]
        )
        session.flush()
        session.add_all(
            [
                AppGeography(
                    id="geo-in",
                    country_code="IN",
                    level="country",
                    level_label="Country",
                    name="India",
                    path="/india",
                ),
                AppGeography(
                    id="geo-in-madhya-pradesh",
                    country_code="IN",
                    level="state",
                    level_label="State",
                    name="Madhya Pradesh",
                    path="/india/madhya-pradesh",
                    parent_id="geo-in",
                ),
            ]
        )
        geography = Geography(slug="mp", country="India", name="Madhya Pradesh")
        session.add(geography)
        session.flush()
        admin_unit = AdminUnit(
            geography_id=geography.id,
            app_geography_id="geo-in-madhya-pradesh",
            level="state",
            code="madhya-pradesh",
            name="Madhya Pradesh",
        )
        release = ModelRelease(
            id="lbw-in",
            module="prediction",
            outcome="lbw",
            version="1.0.0",
            status="active",
            model_files=[{"filename": "state.rds", "sha256": "a" * 64}],
            input_spec={},
        )
        session.add_all([admin_unit, release])
        session.flush()
        session.add_all(
            [
                ModelAreaMapping(
                    model_release_id=release.id,
                    admin_unit_id=admin_unit.id,
                    model_area_key="Madhya Pradesh",
                    model_file="state.rds",
                    validated_pregnancy_windows=[1, 2, 3],
                ),
                ActiveModelAssignment(
                    admin_unit_id=admin_unit.id,
                    module="prediction",
                    outcome="lbw",
                    model_release_id=release.id,
                ),
            ]
        )
        session.commit()
    app.dependency_overrides[require_current_user] = lambda: _user(
        geography_scopes=["/india"]
    )
    return settings_db


def _request(planning_date: date, **fields) -> PredictRequest:
    return PredictRequest(
        geography_id="geo-in-madhya-pradesh", planning_date=planning_date, **fields
    )


def test_live_planning_offers_only_what_the_settings_leave_on(client, india) -> None:
    body = client.get("/model-settings?country=IN&outcome=lbw").json()
    available = body["available"]
    assert [o["code"] for o in available["selectors"]] == [
        "window_3",
        "window_2",
        "window_1",
    ]
    assert [o["code"] for o in available["data_modes"]] == [
        "observed",
        "seasonal",
        "projection",
    ]
    # No outlook in India: live windows all stay on by default.
    assert body["settings"]["selectors"] == ["window_3", "window_2", "window_1"]
    before = get_planning_options(
        "geo-in-madhya-pradesh", session_factory=india, now=NOW
    )
    assert before.validated_pregnancy_windows == [1, 2, 3]
    assert before.next_three_months.available is True

    response = client.put(
        "/model-settings/IN/lbw",
        json={
            "selectors": ["window_3"],
            "default_selector": None,
            "scenarios": ["ssp126"],
            "default_scenario": "ssp126",
            "data_modes": ["observed", "projection"],
        },
    )
    assert response.status_code == 200, response.text

    options = get_planning_options(
        "geo-in-madhya-pradesh", session_factory=india, now=NOW
    )
    assert options.validated_pregnancy_windows == [3]
    assert options.model_result_mode == "single_association"
    assert (
        options.next_three_months.available,
        options.next_three_months.unavailable_reason,
    ) == (False, "MODEL_DATA_MODE_DISABLED")
    assert options.long_term_projection is not None
    assert [s.value for s in options.long_term_projection.scenarios] == ["ssp126"]

    # Submissions are held to the same settings, not only the options shown.
    for request, error in (
        (
            _request(date(2026, 9, 1), pregnancy_windows=(3,)),
            "MODEL_DATA_MODE_DISABLED",
        ),
        (
            _request(date(2026, 5, 1), pregnancy_windows=(1, 3)),
            "MODEL_PREGNANCY_WINDOW_DISABLED",
        ),
        (
            _request(
                date(2040, 5, 1),
                planning_target="long_term_hot_season",
                projection_scenario="ssp585",
                projection_period="2031-2040",
                pregnancy_windows=(3,),
            ),
            "MODEL_SCENARIO_DISABLED",
        ),
    ):
        with pytest.raises(ClimateServiceError) as refused:
            require_enabled_by_settings(request, session_factory=india, now=NOW)
        assert refused.value.code == error
    require_enabled_by_settings(
        _request(date(2026, 5, 1), pregnancy_windows=(3,)),
        session_factory=india,
        now=NOW,
    )


def test_live_settings_keep_one_window_and_one_mode(client, india) -> None:
    for values in (
        {"selectors": [], "scenarios": ["ssp126"], "data_modes": ["observed"]},
        {"selectors": ["window_1"], "scenarios": [], "data_modes": ["observed"]},
        {"selectors": ["window_1"], "scenarios": ["ssp126"], "data_modes": []},
    ):
        response = client.put("/model-settings/IN/lbw", json=values)
        assert response.json()["error"] == "MODEL_SETTINGS_OPTION_REQUIRED"
