"""India's observed months in the shared observed view, from stored results.

A Madhya Pradesh division with a live LBW release validated for windows 1-3
and its stored results is read through the same routes as Kenya: the
capability names the outlook view, the month strip lists the stored months,
each validated window is a selector, and the map shades the division with
the chosen window's stored share. Nothing is scored by a read.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from chart.api.app import app
from chart.auth.service import require_current_user, require_reader

from access_support import member
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
    app.dependency_overrides[require_current_user] = lambda: member(
        "planner", "planning_lead", ["/india"]
    )
    app.dependency_overrides[require_reader] = app.dependency_overrides[
        require_current_user
    ]
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(require_current_user, None)
        app.dependency_overrides.pop(require_reader, None)


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


@pytest.fixture
def anonymous(factory, monkeypatch) -> Iterator[TestClient]:
    """No sign-in at all: the request carries no Authorization header."""

    def frame(_session, geography_id, month, *, outcome, **_kwargs) -> MapResponse:
        return MapResponse(geography_id=geography_id, outcome=outcome, areas=[])

    monkeypatch.setattr("chart.heat_outlook.observed_stored.load_map_view", frame)
    monkeypatch.setattr(
        risk_routes, "_resolve_place_path", lambda _id: "/india/madhya-pradesh"
    )
    app.dependency_overrides.clear()
    yield TestClient(app)


def test_an_open_installation_serves_published_reads_without_sign_in(
    anonymous, monkeypatch
) -> None:
    monkeypatch.setenv("CHART_PUBLIC_READ", "true")
    body = anonymous.get(f"/heat-outlook/{BHOPAL}/observed?outcome=lbw").json()
    assert body["estimate"]["value_percent"] == 20.0
    assert (
        anonymous.get(f"/heat-outlook/{BHOPAL}/capabilities?outcome=lbw").status_code
        == 200
    )
    assert (
        anonymous.get(f"/heat-outlook/{STATE}/observed/map?outcome=lbw").status_code
        == 200
    )


def test_a_closed_installation_still_requires_sign_in(anonymous, monkeypatch) -> None:
    monkeypatch.delenv("CHART_PUBLIC_READ", raising=False)
    response = anonymous.get(f"/heat-outlook/{BHOPAL}/observed?outcome=lbw")
    assert response.status_code == 401


def test_public_visitors_cannot_change_data_or_queue_work(
    anonymous, monkeypatch
) -> None:
    monkeypatch.setenv("CHART_PUBLIC_READ", "true")
    attempts = [
        anonymous.post(
            "/climate/predict",
            json={"geography_id": BHOPAL, "planning_date": "2026-09-01"},
        ),
        anonymous.post("/climate/ingestion-jobs", json={"country_code": "IN"}),
        anonymous.put("/model-settings/IN/lbw", json={}),
        anonymous.get(f"/vra/{STATE}/coverage"),
    ]
    assert [response.status_code for response in attempts] == [401] * len(attempts)


def test_population_layer_shades_density_and_carries_counts(
    anonymous, monkeypatch, tmp_path
) -> None:
    """WorldPop people per area: density shaded, counts beside, public read."""
    from chart.population import service as population

    data = tmp_path / "worldpop.json"
    data.write_text(
        json.dumps(
            {
                "source": "WorldPop Global2 R2025A, constrained, UN adjusted, 1 km",
                "year": 2025,
                "license": "CC BY 4.0",
                "source_uri": "https://hub.worldpop.org/project/categories?id=3",
                "citation": "Bondarenko M. et al. (2025).",
                "places": {
                    BHOPAL: {
                        "total": 8_000_000,
                        "under5": 700_000,
                        "women_15_49": 2_100_000,
                        "area_km2": 25_000.0,
                    },
                    STATE: {
                        "total": 88_000_000,
                        "under5": 8_000_000,
                        "women_15_49": 23_000_000,
                        "area_km2": 308_000.0,
                    },
                },
            }
        )
    )
    monkeypatch.setattr(population, "DATA", data)
    population._document.cache_clear()

    def frame(_session, geography_id, month, **_kwargs) -> MapResponse:
        return MapResponse(
            geography_id=geography_id,
            outcome="lbw",
            areas=[
                MapArea(
                    admin_unit_id=1,
                    geography_id=BHOPAL,
                    code="bhopal",
                    level="division",
                    name="Bhopal",
                ),
                MapArea(
                    admin_unit_id=2,
                    geography_id="geo-in-madhya-pradesh-division-sagar",
                    code="sagar",
                    level="division",
                    name="Sagar",
                ),
            ],
        )

    monkeypatch.setattr(population, "load_map_view", frame)
    monkeypatch.setenv("CHART_PUBLIC_READ", "true")

    body = anonymous.get(f"/heat-outlook/{STATE}/population").json()
    areas = {area["geography_id"]: area for area in body["areas"]}
    assert areas[BHOPAL]["value_percent"] == 320.0  # people per km2
    # Sagar is not a place this database knows, so it is not shown at all.
    assert set(areas) == {BHOPAL}
    assert body["counts"][BHOPAL]["under5"] == 700_000
    assert body["place"]["total"] == 88_000_000
    assert body["license"] == "CC BY 4.0"

    under5 = anonymous.get(f"/heat-outlook/{STATE}/population?measure=under5").json()
    assert under5["areas"][0]["value_percent"] == 28.0
    assert (
        anonymous.get(f"/heat-outlook/{STATE}/population?measure=men").status_code
        == 422
    )
    monkeypatch.setattr(population, "DATA", tmp_path / "missing.json")
    population._document.cache_clear()
    assert anonymous.get(f"/heat-outlook/{STATE}/population").status_code == 404
    population._document.cache_clear()
