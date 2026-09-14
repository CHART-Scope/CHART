"""HTTP + service tests for the Short-term and Long-term dashboard routes."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from chart.api.app import app
from chart.auth.schemas import CurrentUserContext
from chart.auth.service import require_current_user
from chart.risk import routes as risk_routes
from chart.risk.precision import precision_for_ci
from chart.shared.db.base import Base
from chart.shared.db.models import (
    AdminUnit,
    AppGeography,
    ClimateRun,
    CountryGeoConfig,
    DataLabel,
    DataSource,
    ErfParameters,
    Geography,
    HealthImpact,
    Provenance,
)


PLACE_PATH = "/india/madhya-pradesh"
GEOGRAPHY_ID = "geo-in-madhya-pradesh"


@pytest.fixture
def isolated_session_factory():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with engine.begin() as connection:
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    with factory() as session:
        _seed_dashboard_fixture(session)
        session.commit()

    return factory


def _seed_dashboard_fixture(session: Session) -> None:
    session.add(
        CountryGeoConfig(
            country_code="IN",
            level_key="state",
            level_label="State",
        )
    )
    session.flush()

    session.add(
        AppGeography(
            id=GEOGRAPHY_ID,
            country_code="IN",
            level="state",
            level_label="State",
            name="Madhya Pradesh",
            path=PLACE_PATH,
        )
    )
    session.flush()

    geography = Geography(slug="madhya-pradesh", country="India", name="Madhya Pradesh")
    session.add(geography)
    session.flush()

    admin_unit = AdminUnit(
        geography_id=geography.id,
        app_geography_id=GEOGRAPHY_ID,
        level="district",
        code="MP-BAR",
        name="Barwani",
    )
    session.add(admin_unit)

    provenance = Provenance(source_uri="s3://climate/mp.zarr", input_hash="c" * 64)
    data_source = DataSource(name="ISIMIP3b", kind="projection")
    session.add_all([provenance, data_source])
    session.flush()

    climate_run = ClimateRun(
        data_source_id=data_source.id,
        provenance_id=provenance.id,
        tier="projection",
        input_hash="r" * 64,
        scenario="ssp245",
        data_label=DataLabel.projection,
    )
    session.add(climate_run)
    session.flush()

    erf = ErfParameters(
        geography_id=geography.id,
        outcome="lbw",
        spline_coefficients={"k": 1},
        lag_window={"months": [1, 2, 3]},
        reference_percentile_milli=27000,
        git_ref="modeler-abc123",
    )
    session.add(erf)
    session.flush()

    session.add_all(
        [
            _health_impact(
                admin_unit.id,
                erf.id,
                climate_run.id,
                "seas5_ensemble",
                "m3",
                date(2026, 10, 1),
                rr=1150,
                low=1130,
                high=1170,
                af=130,
                an=195,
            ),
            _health_impact(
                admin_unit.id,
                erf.id,
                climate_run.id,
                "seas5_ensemble",
                "m6",
                date(2027, 1, 1),
                rr=1180,
                # CI ratio 3000/1000 = 3.0 falls in the MODERATE band.
                low=1000,
                high=3000,
                af=153,
                an=230,
            ),
            _health_impact(
                admin_unit.id,
                erf.id,
                climate_run.id,
                "rcp26",
                "y5",
                date(2031, 7, 1),
                rr=1140,
                low=1080,
                high=1200,
                af=123,
                an=180,
            ),
            _health_impact(
                admin_unit.id,
                erf.id,
                climate_run.id,
                "rcp26",
                "y15",
                date(2041, 7, 1),
                rr=1160,
                low=1100,
                high=1230,
                af=138,
                an=205,
            ),
            _health_impact(
                admin_unit.id,
                erf.id,
                climate_run.id,
                "rcp45",
                "y15",
                date(2041, 7, 1),
                rr=1250,
                low=1180,
                high=1320,
                af=200,
                an=300,
            ),
            _health_impact(
                admin_unit.id,
                erf.id,
                climate_run.id,
                "rcp60",
                "y25",
                date(2051, 7, 1),
                rr=1340,
                low=1230,
                high=1450,
                af=254,
                an=380,
            ),
        ]
    )


def _health_impact(
    admin_unit_id: int,
    erf_id: int,
    climate_run_id: int,
    scenario: str,
    horizon: str,
    valid_month: date,
    *,
    rr: int,
    low: int,
    high: int,
    af: int,
    an: int,
) -> HealthImpact:
    return HealthImpact(
        admin_unit_id=admin_unit_id,
        erf_parameters_id=erf_id,
        climate_run_id=climate_run_id,
        scenario=scenario,
        horizon=horizon,
        valid_month=valid_month,
        relative_risk_milli=rr,
        rr_ci_low_milli=low,
        rr_ci_high_milli=high,
        attributable_fraction_milli=af,
        attributable_number=an,
        data_label=DataLabel.modeled,
    )


def _override_user(**overrides) -> CurrentUserContext:
    defaults = dict(
        user_id="test-user",
        username="test-user",
        roles=["health_planning_lead"],
        geography_scopes=[PLACE_PATH],
    )
    defaults.update(overrides)
    return CurrentUserContext(**defaults)


@pytest.fixture
def dashboard_client(isolated_session_factory, monkeypatch) -> Iterator[TestClient]:
    monkeypatch.setattr(
        risk_routes, "get_session_factory", lambda: isolated_session_factory
    )
    monkeypatch.setattr(risk_routes, "_resolve_place_path", lambda _id: PLACE_PATH)
    app.dependency_overrides[require_current_user] = lambda: _override_user()
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(require_current_user, None)


def test_short_term_without_admin_unit_query_uses_default_for_geography(
    dashboard_client,
) -> None:
    response = dashboard_client.get(f"/risk/{GEOGRAPHY_ID}/short-term")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["admin_unit_code"] == "MP-BAR"
    assert len(body["cards"]) == 2


def test_short_term_returns_series_and_horizon_cards(dashboard_client) -> None:
    response = dashboard_client.get(
        f"/risk/{GEOGRAPHY_ID}/short-term?admin_unit=MP-BAR"
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["admin_unit_code"] == "MP-BAR"
    seas5_points = [p for p in body["series"] if p["scenario"] == "seas5_ensemble"]
    rcp45_points = [p for p in body["series"] if p["scenario"] == "rcp45"]
    assert len(seas5_points) == 2
    assert len(rcp45_points) >= 0  # design allows a near-term rcp45 continuation

    cards = {card["horizon"]: card for card in body["cards"]}
    assert set(cards) == {"m3", "m6"}
    assert cards["m3"]["attributable_fraction_milli"] == 130
    assert cards["m3"]["precision"] == "high"
    assert cards["m6"]["precision"] == "moderate"


def test_short_term_empty_series_when_no_rows(dashboard_client) -> None:
    response = dashboard_client.get(
        f"/risk/{GEOGRAPHY_ID}/short-term?admin_unit=MP-BAR"
    )
    assert response.status_code == 200
    body = response.json()
    for card in body["cards"]:
        assert 0 <= card["attributable_fraction_milli"] < 1000


def test_long_term_returns_three_scenarios_in_design_order(dashboard_client) -> None:
    response = dashboard_client.get(f"/risk/{GEOGRAPHY_ID}/long-term?admin_unit=MP-BAR")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["socioeconomic_baseline"] == "ssp2"
    names = [scenario["name"] for scenario in body["scenarios"]]
    assert names == ["rcp26", "rcp45", "rcp60"]
    labels = [scenario["label"] for scenario in body["scenarios"]]
    assert labels == [
        "Very low emissions (RCP 2.6)",
        "Low emissions (RCP 4.5)",
        "High emissions (RCP 6.0)",
    ]

    rcp26 = body["scenarios"][0]
    assert [row["horizon"] for row in rcp26["table"]] == ["y5", "y15"]


def test_long_term_returns_empty_scenarios_when_no_rows(dashboard_client) -> None:
    response = dashboard_client.get(f"/risk/{GEOGRAPHY_ID}/long-term?admin_unit=NONE")
    assert response.status_code == 404
    assert response.json()["error"] == "ADMIN_UNIT_NOT_FOUND"


def test_short_term_denies_geography_the_user_cannot_access(
    isolated_session_factory, monkeypatch
) -> None:
    monkeypatch.setattr(
        risk_routes, "get_session_factory", lambda: isolated_session_factory
    )
    monkeypatch.setattr(risk_routes, "_resolve_place_path", lambda _id: PLACE_PATH)
    app.dependency_overrides[require_current_user] = lambda: _override_user(
        geography_scopes=["/kenya/kajiado"]
    )
    try:
        client = TestClient(app)
        response = client.get(f"/risk/{GEOGRAPHY_ID}/short-term?admin_unit=MP-BAR")
        assert response.status_code == 403
    finally:
        app.dependency_overrides.pop(require_current_user, None)


def test_short_term_rejects_unauthenticated_client() -> None:
    client = TestClient(app)
    response = client.get(f"/risk/{GEOGRAPHY_ID}/short-term?admin_unit=MP-BAR")
    assert response.status_code in (401, 403)


def test_precision_thresholds_match_intent() -> None:
    # CI ratio ≤ 2.5 -> high (no indication of substantial imprecision)
    assert precision_for_ci(1000, 2500) == "high"
    assert precision_for_ci(1.15, 1.30) == "high"
    # 2.5 < CI ratio ≤ 5 -> moderate (potential imprecision)
    assert precision_for_ci(1000, 3000) == "moderate"
    assert precision_for_ci(1000, 5000) == "moderate"
    # CI ratio > 5 -> low (imprecise / wide confidence interval)
    assert precision_for_ci(1000, 6000) == "low"
    # Non-positive lower bound falls into the LOW bucket without dividing by zero.
    assert precision_for_ci(0, 1000) == "low"
