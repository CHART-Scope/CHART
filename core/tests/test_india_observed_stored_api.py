"""India's observed months in the shared observed view, from stored results.

A Madhya Pradesh division with a live LBW release validated for windows 1-3
and its stored results is read through the same routes as Kenya: the
capability names the outlook view, the month strip lists the stored months,
each validated window is a selector, and the map shades the division with
the chosen window's stored share. Nothing is scored by a read.
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from chart.api.app import app
from chart.auth.schemas import CurrentUserContext
from chart.auth.service import require_current_user
from chart.heat_outlook import routes as outlook_routes
from chart.model_settings import service as settings_service
from chart.risk import routes as risk_routes
from chart.risk.service import MapArea, MapResponse
from chart.shared.db.base import Base
from chart.shared.db.models import (
    ActiveModelAssignment,
    AdminUnit,
    AppGeography,
    CountryGeoConfig,
    DataLabel,
    Geography,
    ModelAreaMapping,
    ModelRelease,
    PredictionResult,
)

STATE = "geo-in-madhya-pradesh"
BHOPAL = "geo-in-madhya-pradesh-division-bhopal"
RELEASE = "lbw-mp-test"
#: (window, month, attributable fraction in thousandths, odds ratio)
STORED = (
    (1, date(2026, 9, 1), 200, 1.25),
    (2, date(2026, 9, 1), 120, 1.14),
    (3, date(2026, 9, 1), -30, 0.97),
    (1, date(2026, 8, 1), 150, 1.18),
)


@pytest.fixture
def factory(monkeypatch):
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    with factory() as session:
        for level in ("state", "division"):
            session.add(
                CountryGeoConfig(
                    country_code="IN", level_key=level, level_label=level.title()
                )
            )
        session.flush()
        session.add(
            AppGeography(
                id=STATE,
                country_code="IN",
                level="state",
                level_label="State",
                name="Madhya Pradesh",
                path="/india/madhya-pradesh",
            )
        )
        session.flush()
        session.add(
            AppGeography(
                id=BHOPAL,
                country_code="IN",
                level="division",
                level_label="Division",
                name="Bhopal",
                parent_id=STATE,
                path="/india/madhya-pradesh/bhopal",
            )
        )
        geography = Geography(slug="madhya-pradesh", country="India", name="MP")
        session.add(geography)
        session.flush()
        unit = AdminUnit(
            geography_id=geography.id,
            app_geography_id=BHOPAL,
            level="division",
            code="bhopal",
            name="Bhopal",
        )
        session.add(unit)
        session.add(
            ModelRelease(
                id=RELEASE,
                module="prediction",
                outcome="lbw",
                version="test-v1",
                status="active",
                model_files=[{"filename": "bhopal.rds", "sha256": "a" * 64}],
                input_spec={},
                release_file_uri=f"s3://chart-models/{RELEASE}/model-release.json",
            )
        )
        session.flush()
        session.add_all(
            [
                ModelAreaMapping(
                    model_release_id=RELEASE,
                    admin_unit_id=unit.id,
                    model_area_key="Bhopal",
                    model_file="bhopal.rds",
                    validated_pregnancy_windows=[1, 2, 3],
                ),
                ActiveModelAssignment(
                    admin_unit_id=unit.id,
                    module="prediction",
                    outcome="lbw",
                    model_release_id=RELEASE,
                ),
            ]
        )
        for window, month, af_milli, odds_ratio in STORED:
            session.add(
                PredictionResult(
                    admin_unit_id=unit.id,
                    outcome="lbw",
                    model_release_id=RELEASE,
                    valid_month=month,
                    scenario="seas5_ensemble",
                    horizon="m1",
                    pregnancy_window=window,
                    odds_ratio=odds_ratio,
                    ci95_low=odds_ratio - 0.05,
                    ci95_high=odds_ratio + 0.05,
                    attributable_fraction_milli=af_milli,
                    on_training_support=True,
                    model_version="test-v1",
                    exposure_values_c=[31.0, 33.5, 35.0],
                    exposure_dates=["2026-07-01", "2026-08-01", "2026-09-01"],
                    data_label=DataLabel.reanalysis,
                )
            )
        session.commit()
    monkeypatch.setattr(settings_service, "get_session_factory", lambda: factory)
    monkeypatch.setattr(outlook_routes, "get_session_factory", lambda: factory)
    return factory


@pytest.fixture
def client(factory, monkeypatch) -> Iterator[TestClient]:
    def frame(_session, geography_id, month, *, outcome, **_kwargs) -> MapResponse:
        return MapResponse(
            geography_id=geography_id,
            outcome=outcome,
            month=month,
            areas=[
                MapArea(
                    admin_unit_id=1,
                    geography_id=BHOPAL,
                    code="bhopal",
                    level="division",
                    name="Bhopal",
                    geometry={
                        "type": "Polygon",
                        "coordinates": [[[77, 23], [78, 23], [78, 24], [77, 23]]],
                    },
                )
            ],
        )

    monkeypatch.setattr("chart.heat_outlook.observed_stored.load_map_view", frame)
    monkeypatch.setattr(
        risk_routes,
        "_resolve_place_path",
        lambda geography_id: (
            "/india/madhya-pradesh"
            if geography_id == STATE
            else "/india/madhya-pradesh/bhopal"
        ),
    )
    app.dependency_overrides[require_current_user] = lambda: CurrentUserContext(
        user_id="planner",
        username="planner",
        roles=["health_planning_lead"],
        geography_scopes=["/india"],
    )
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(require_current_user, None)


def test_capability_uses_the_shared_observed_view(client) -> None:
    body = client.get(f"/heat-outlook/{BHOPAL}/capabilities?outcome=lbw").json()
    assert body["observed"]["source"] == "outlook"
    assert body["observed"]["release"] == RELEASE
    assert body["observed"]["batch_enabled"] is False
    assert "observed" in body["data_modes"]


def test_months_and_every_validated_window_come_from_stored_results(client) -> None:
    body = client.get(f"/heat-outlook/{BHOPAL}/observed?outcome=lbw").json()

    assert [option["code"] for option in body["selectors"]] == [
        "window_3",
        "window_2",
        "window_1",
    ]
    assert body["selector"] == "window_1"
    assert body["available_months"] == ["2026-08", "2026-09"]
    assert body["month"] == "2026-09"
    assert body["estimate"]["value_percent"] == 20.0
    assert body["estimate"]["ratio"]["value"] == 1.25
    assert [item["month"] for item in body["history"]] == ["2026-08", "2026-09"]

    middle = client.get(
        f"/heat-outlook/{BHOPAL}/observed?outcome=lbw&selector=window_2"
    ).json()
    assert middle["estimate"]["value_percent"] == 12.0
    # Window 2 has no August result, so August is not offered for it.
    assert middle["available_months"] == ["2026-09"]

    first = client.get(
        f"/heat-outlook/{BHOPAL}/observed?outcome=lbw&selector=window_3"
    ).json()
    # A negative share is never shown as heat preventing cases.
    assert first["estimate"]["value_percent"] is None
    assert first["estimate"]["message"]


def test_map_shades_the_division_with_the_chosen_window(client) -> None:
    final = client.get(
        f"/heat-outlook/{STATE}/observed/map?outcome=lbw&month=2026-09"
    ).json()
    (area,) = final["areas"]
    assert area["value_percent"] == 20.0
    middle = client.get(
        f"/heat-outlook/{STATE}/observed/map?outcome=lbw&month=2026-09&selector=window_2"
    ).json()
    assert middle["areas"][0]["value_percent"] == 12.0


def test_unknown_window_and_month_are_refused(client) -> None:
    assert (
        client.get(
            f"/heat-outlook/{BHOPAL}/observed?outcome=lbw&selector=P"
        ).status_code
        == 422
    )
    assert (
        client.get(
            f"/heat-outlook/{BHOPAL}/observed?outcome=lbw&month=2026-07"
        ).status_code
        == 422
    )
