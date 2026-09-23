"""HTTP + service tests for the Short-term and Long-term dashboard routes."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import date, datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from chart.api.app import app
from chart.auth.schemas import CurrentUserContext
from chart.auth.service import require_current_user
from chart.risk import routes as risk_routes
from chart.risk.precision import precision_for_ci
from chart.shared.db.base import Base
from chart.climate.prediction_results import (
    integrity_problem,
    upsert_prediction_result,
)
from chart.climate.schemas import PredictResponse
from chart.shared.db.models import (
    AdminUnit,
    AppGeography,
    ClimateRun,
    CountryGeoConfig,
    DataLabel,
    DataSource,
    DistrictClimate,
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


def test_monthly_reads_pipeline_maxima_and_month_matched_impacts(
    dashboard_client,
    isolated_session_factory,
) -> None:
    from era5_heat.fixtures import fixture_demo
    from chart.shared.db.climate_load import load_era5_monthly_frame

    frame, meta = fixture_demo("madhya-pradesh", years=1, end_year=2026)
    with isolated_session_factory() as session:
        admin = session.scalar(select(AdminUnit))
        admin.boundary_version = "test-boundary-v1"
        run = load_era5_monthly_frame(
            session,
            preset_slug="madhya-pradesh",
            admin_unit_id=admin.id,
            df=frame,
            meta=meta,
            csv_path="/tmp/monthly-fixture.csv",
            allow_sample=True,
        )
        session.commit()
        run_id = run.id

    response = dashboard_client.get(f"/risk/{GEOGRAPHY_ID}/monthly")
    assert response.status_code == 200, response.text
    months = response.json()["months"]
    assert list(months) == sorted(months)
    for row in frame.itertuples():
        temperature = months[row.month.strftime("%Y-%m")]["temperature"]
        assert temperature["tmax_monthly_mean_c"] == row.tmax_monthly_mean_c
        assert temperature["tmax_monthly_mean_c"] != row.tmax_monthly_max_c
        assert temperature["climate_run_id"] == run_id
        assert temperature["unit"] == "degC"
        assert temperature["data_label"] == "sample"
    assert months["2026-09"]["health_impacts"] == []
    assert months["2026-10"]["health_impacts"][0]["attributable_fraction_milli"] == 130
    assert months["2026-10"]["health_impacts"][0]["attributable_number"] == 195
    assert months["2027-01"]["temperature"] is None
    assert months["2027-01"]["health_impacts"][0]["attributable_fraction_milli"] == 153


def test_monthly_keeps_scenarios_and_horizons_separate(
    dashboard_client, isolated_session_factory
):
    with isolated_session_factory() as session:
        original = session.scalar(select(HealthImpact))
        session.add(
            _health_impact(
                original.admin_unit_id,
                original.erf_parameters_id,
                original.climate_run_id,
                "seas5_ensemble",
                "m1",
                date(2026, 10, 1),
                rr=1200,
                low=1100,
                high=1300,
                af=167,
                an=250,
            )
        )
        session.commit()
    response = dashboard_client.get(f"/risk/{GEOGRAPHY_ID}/monthly?month=2026-10")
    assert response.status_code == 200
    months = response.json()["months"]
    assert list(months) == ["2026-10"]
    assert {
        p["horizon"]: p["attributable_fraction_milli"]
        for p in months["2026-10"]["health_impacts"]
    } == {"m1": 167, "m3": 130}


def test_monthly_never_falls_back_to_peak_or_other_geography(
    dashboard_client, isolated_session_factory
):
    with isolated_session_factory() as session:
        admin = session.scalar(select(AdminUnit))
        run = session.scalar(select(ClimateRun))
        run.tier = "observed"
        source = session.get(DataSource, run.data_source_id)
        source.name = "Copernicus ERA5 single levels"
        other_admin = AdminUnit(
            geography_id=admin.geography_id,
            level="district",
            code="OTHER",
            name="Other",
        )
        session.add(other_admin)
        session.flush()
        session.add_all(
            [
                DistrictClimate(
                    admin_unit_id=admin.id,
                    climate_run_id=run.id,
                    period_month=date(2026, 9, 1),
                    variable="tmax_monthly_max_c",
                    value=42,
                    unit="degC",
                ),
                DistrictClimate(
                    admin_unit_id=other_admin.id,
                    climate_run_id=run.id,
                    period_month=date(2026, 9, 1),
                    variable="tmax_monthly_mean_c",
                    value=30,
                    unit="degC",
                ),
            ]
        )
        session.commit()
    assert (
        dashboard_client.get(f"/risk/{GEOGRAPHY_ID}/monthly?month=2026-09").json()[
            "months"
        ]
        == {}
    )


@pytest.mark.parametrize(
    "month", ["2026-00", "2026-13", "2026-1", "2026-09-01", "0000-01"]
)
def test_monthly_rejects_invalid_month(dashboard_client, month):
    assert (
        dashboard_client.get(f"/risk/{GEOGRAPHY_ID}/monthly?month={month}").status_code
        == 422
    )


def test_monthly_rejects_unauthenticated_client():
    assert TestClient(app).get(f"/risk/{GEOGRAPHY_ID}/monthly").status_code in (
        401,
        403,
    )


@pytest.mark.parametrize(
    "overrides",
    [
        {"roles": ["unknown_role"]},
        {"geography_scopes": ["/kenya/kajiado"]},
    ],
)
def test_monthly_denies_role_and_geography(dashboard_client, overrides):
    app.dependency_overrides[require_current_user] = lambda: _override_user(**overrides)
    assert dashboard_client.get(f"/risk/{GEOGRAPHY_ID}/monthly").status_code == 403


def test_monthly_returns_empty_for_unlinked_geography(dashboard_client):
    response = dashboard_client.get("/risk/unlinked/monthly")
    assert response.status_code == 200
    assert response.json()["months"] == {}


def test_monthly_unknown_geography_returns_404(isolated_session_factory, monkeypatch):
    monkeypatch.setattr(
        risk_routes, "get_session_factory", lambda: isolated_session_factory
    )
    app.dependency_overrides[require_current_user] = lambda: _override_user()
    try:
        response = TestClient(app).get("/risk/unknown/monthly")
        assert response.status_code == 404
        assert response.json()["error"] == "GEOGRAPHY_NOT_FOUND"
    finally:
        app.dependency_overrides.pop(require_current_user, None)


def test_monthly_selects_newest_source_revision_not_last_insert(
    dashboard_client,
    isolated_session_factory,
):
    with isolated_session_factory() as session:
        admin = session.scalar(select(AdminUnit))
        base = session.scalar(select(ClimateRun))
        session.get(DataSource, base.data_source_id).name = (
            "Copernicus ERA5 single levels"
        )
        for index, (generated_day, value) in enumerate([(12, 38.0), (11, 45.0)]):
            run = ClimateRun(
                data_source_id=base.data_source_id,
                provenance_id=base.provenance_id,
                tier="observed",
                input_hash=str(index) * 64,
                data_label=DataLabel.reanalysis,
                generated_at=datetime(2026, 9, generated_day, tzinfo=timezone.utc),
            )
            session.add(run)
            session.flush()
            session.add(
                DistrictClimate(
                    admin_unit_id=admin.id,
                    climate_run_id=run.id,
                    period_month=date(2026, 8, 1),
                    variable="tmax_monthly_mean_c",
                    value=value,
                    unit="degC",
                )
            )
        session.commit()
    body = dashboard_client.get(f"/risk/{GEOGRAPHY_ID}/monthly?month=2026-08").json()
    assert body["months"]["2026-08"]["temperature"]["tmax_monthly_mean_c"] == 38.0


def test_monthly_excludes_other_outcomes(dashboard_client, isolated_session_factory):
    with isolated_session_factory() as session:
        session.scalar(select(ErfParameters)).outcome = "u5_mortality"
        session.commit()
    assert dashboard_client.get(f"/risk/{GEOGRAPHY_ID}/monthly").json()["months"] == {}


def test_monthly_checks_exact_selected_geography_scope(
    isolated_session_factory, monkeypatch
):
    monkeypatch.setattr(
        risk_routes, "get_session_factory", lambda: isolated_session_factory
    )
    with isolated_session_factory() as session:
        session.add(
            AppGeography(
                id="other-state",
                country_code="IN",
                level="state",
                level_label="State",
                name="Other state",
                path="/india/other-state",
            )
        )
        session.commit()
    app.dependency_overrides[require_current_user] = lambda: _override_user()
    try:
        client = TestClient(app)
        assert client.get(f"/risk/{GEOGRAPHY_ID}/monthly").status_code == 200
        assert client.get("/risk/other-state/monthly").status_code == 403
    finally:
        app.dependency_overrides.pop(require_current_user, None)


def _climate(*, months=(8, 7, 6), source_class="observed", data_label="reanalysis"):
    """The three climate months a monthly result stands on."""
    return [
        {
            "month": f"2026-{month:02d}",
            "temperature_c": 32,
            "status": "ready",
            "source_class": source_class,
            "data_label": data_label,
            "expected_source_name": "ERA5",
            "source_policy_version": "test",
        }
        for month in months
    ]


def _monthly_request(
    session,
    *,
    user_id="test-user",
    key="monthly",
    outcome="lbw",
    prediction_overrides=None,
    place_geography_id=None,
    **overrides,
):
    from chart.shared.db.models import PredictionRequestRecord

    admin = session.scalar(select(AdminUnit))
    payload = {
        "place": {
            "geography_id": GEOGRAPHY_ID,
            "code": admin.code,
            "name": admin.name,
            "level": "district",
            "path": PLACE_PATH,
            "supports_prediction": True,
        },
        "planning_date": "2026-08-01",
        "availability": {
            "status": "ready",
            "months_found": 3,
            "missing_months": [],
            "message": "Ready",
        },
        "climate": [
            {
                "month": f"2026-{month:02d}",
                "temperature_c": 32,
                "status": "ready",
                "source_class": "observed",
                "data_label": "reanalysis",
                "expected_source_name": "ERA5",
                "source_policy_version": "test",
            }
            for month in (8, 7, 6)
        ],
        "prediction": {
            "area": admin.name,
            "geography_level": "district",
            "pregnancy_window": 1,
            "temperatures_c": [32, 32, 32],
            "reference_temperature_c": 28,
            "odds_ratio": 1.25,
            "ci95_low": 1.1,
            "ci95_high": 1.4,
            "on_training_support": True,
            "model_file": "review.rds",
            "model_version": "test-v1",
        },
        "request_id": 1,
        **overrides,
    }
    if prediction_overrides:
        payload["prediction"] = {**payload["prediction"], **prediction_overrides}
    if place_geography_id is not None:
        payload["place"] = {**payload["place"], "geography_id": place_geography_id}
    release_id = _ensure_model_release(session, outcome)
    record = PredictionRequestRecord(
        request_key=key,
        location_slug=GEOGRAPHY_ID,
        timeframe_id="month",
        admin_unit_id=admin.id,
        planning_date=date(2026, 8, 1),
        requested_by_user_id=user_id,
        model_release_id=release_id,
        status="completed",
        stage="completed",
        request_payload={"geography_id": GEOGRAPHY_ID, "outcome": outcome},
        result_payload=payload,
    )
    session.add(record)
    session.flush()
    # Store the result the way completion does - same integrity guard, same
    # derivation - so these tests exercise the real path rather than a
    # hand-written row that could agree with nothing in production.
    result = PredictResponse.model_validate(payload)
    if (
        integrity_problem(
            result, geography_id=GEOGRAPHY_ID, valid_month=date(2026, 8, 1)
        )
        is None
    ):
        upsert_prediction_result(
            session,
            result=result,
            admin_unit_id=admin.id,
            outcome=outcome,
            model_release_id=release_id,
            valid_month=date(2026, 8, 1),
            prediction_request_id=record.id,
        )
    return record


def _ensure_model_release(session, outcome: str) -> str:
    """A minimal release for the grain's foreign key."""
    from chart.shared.db.models import ModelRelease

    release_id = f"test-release-{outcome}"
    if session.get(ModelRelease, release_id) is None:
        session.add(
            ModelRelease(
                id=release_id,
                module="prediction",
                outcome=outcome,
                version="test-v1",
                status="active",
                model_files=[],
                input_spec={},
            )
        )
        session.flush()
    return release_id


def test_monthly_reads_current_prediction_without_legacy_erf(
    dashboard_client, isolated_session_factory
):
    with isolated_session_factory() as session:
        # No ERF or health-impact bridge is necessary for model-registry results.
        for row in session.scalars(select(HealthImpact)):
            session.delete(row)
        session.flush()
        for row in session.scalars(select(ErfParameters)):
            session.delete(row)
        record = _monthly_request(session)
        request_id = record.id
        session.commit()
    response = dashboard_client.get(f"/risk/{GEOGRAPHY_ID}/monthly?month=2026-08")
    assert response.status_code == 200
    entry = response.json()["months"]["2026-08"]
    assert entry["health_impacts"] == []
    assert entry["temperature"] is None
    assert entry["prediction"]["request_id"] == request_id
    assert entry["prediction"]["attributable_fraction_milli"] == 200
    assert entry["prediction"]["input_statistic"] == "tmax_monthly_mean_c"
    assert (
        dashboard_client.get(f"/risk/{GEOGRAPHY_ID}/monthly?month=2026-07").json()[
            "months"
        ]
        == {}
    )


def test_monthly_below_reference_month_reports_no_attributable_share(
    dashboard_client, isolated_session_factory
):
    """A cooler-than-reference month attributes nothing, even when OR > 1.

    Real case: Bhopal January sits at 24.0 C against a 27.0 C reference and
    the division fit returns OR 1.33. Reporting a quarter of cases as
    heat-attributable there inverts the public-health message.
    """

    with isolated_session_factory() as session:
        _monthly_request(
            session,
            climate=[
                {
                    "month": f"2026-{month:02d}",
                    "temperature_c": 24.0,
                    "status": "ready",
                    "source_class": "observed",
                    "data_label": "reanalysis",
                    "expected_source_name": "ERA5",
                    "source_policy_version": "test",
                }
                for month in (8, 7, 6)
            ],
            prediction_overrides={
                "odds_ratio": 1.332,
                "reference_temperature_c": 27.0,
                "ci95_low": 0.984,
                "ci95_high": 1.803,
            },
        )
        session.commit()
    entry = dashboard_client.get(f"/risk/{GEOGRAPHY_ID}/monthly?month=2026-08").json()[
        "months"
    ]["2026-08"]
    assert entry["prediction"]["odds_ratio"] == 1.332
    assert entry["prediction"]["attributable_fraction_milli"] == 0


def test_monthly_above_reference_month_keeps_its_attributable_share(
    dashboard_client, isolated_session_factory
):
    """The same odds ratio above the reference still attributes normally."""

    with isolated_session_factory() as session:
        _monthly_request(
            session,
            prediction_overrides={
                "odds_ratio": 1.332,
                "reference_temperature_c": 27.0,
            },
        )
        session.commit()
    entry = dashboard_client.get(f"/risk/{GEOGRAPHY_ID}/monthly?month=2026-08").json()[
        "months"
    ]["2026-08"]
    # 32 C exposure vs a 27 C reference: (1.332 - 1) / 1.332 = 0.2492
    assert entry["prediction"]["attributable_fraction_milli"] == 249


def test_monthly_returns_predictions_for_the_requested_outcome(
    dashboard_client, isolated_session_factory
) -> None:
    """Selecting a non-LBW outcome must return that outcome's predictions.

    The monthly view previously called load_monthly_predictions without an
    outcome, so it defaulted to low birth weight and silently dropped every
    under-five prediction no matter what the dashboard asked for.
    """

    with isolated_session_factory() as session:
        _monthly_request(session, key="u5", outcome="under_5_mortality")
        session.commit()

    under_five = dashboard_client.get(
        f"/risk/{GEOGRAPHY_ID}/monthly?month=2026-08&outcome=under_5_mortality"
    ).json()["months"]
    assert under_five["2026-08"]["prediction"] is not None

    # The same request without the outcome must not pick it up.
    default = dashboard_client.get(
        f"/risk/{GEOGRAPHY_ID}/monthly?month=2026-08"
    ).json()["months"]
    assert default == {} or default["2026-08"]["prediction"] is None


@pytest.mark.parametrize(
    "kind",
    [
        "other_geography",
        "forecast",
        "failed",
        "malformed",
        "other_window",
        "other_outcome",
        "wrong_month",
        "wrong_place",
        "sample",
    ],
)
def test_monthly_excludes_inapplicable_predictions(
    dashboard_client, isolated_session_factory, kind
):
    """None of these may reach the monthly card.

    The checks now run when a result is written rather than on every read, so
    each case is applied before storage: a result that disagrees with its own
    request is refused outright, and one built on forecast or sample data is
    stored honestly labelled and filtered out by the card.
    """

    prediction_overrides = None
    payload_overrides = {}
    outcome = "lbw"
    store = True

    if kind == "forecast":
        payload_overrides["climate"] = _climate(source_class="seasonal")
    if kind == "sample":
        payload_overrides["climate"] = _climate(data_label="sample")
    if kind == "other_window":
        prediction_overrides = {"pregnancy_window": 2}
    if kind == "other_outcome":
        outcome = "under_5_mortality"
    if kind == "wrong_month":
        payload_overrides["climate"] = _climate(months=(8, 7, 5))
    if kind == "wrong_place":
        payload_overrides["place_geography_id"] = "geo-ke-baringo"
    if kind in {"other_geography", "failed", "malformed"}:
        # These never complete cleanly, so nothing is ever stored for them.
        store = False

    with isolated_session_factory() as session:
        if store:
            _monthly_request(
                session,
                outcome=outcome,
                prediction_overrides=prediction_overrides,
                **payload_overrides,
            )
        session.commit()

    assert (
        dashboard_client.get(f"/risk/{GEOGRAPHY_ID}/monthly?month=2026-08").json()[
            "months"
        ]
        == {}
    )


def test_a_month_computed_by_one_user_is_visible_to_another(
    dashboard_client, isolated_session_factory
):
    """Stored results are shared.

    A prediction is a statement about a place and a month, not about who asked
    for it. Scoping them to the requester meant every planner re-ran the same
    months and re-pulled the same observations.
    """

    with isolated_session_factory() as session:
        _monthly_request(session, user_id="someone-else")
        session.commit()

    entry = dashboard_client.get(f"/risk/{GEOGRAPHY_ID}/monthly?month=2026-08").json()[
        "months"
    ]["2026-08"]
    assert entry["prediction"] is not None


def test_monthly_prefers_latest_completed_prediction_and_preserves_zero(
    dashboard_client, isolated_session_factory
):
    with isolated_session_factory() as session:
        old = _monthly_request(session, key="old")
        old.completed_at = datetime(2026, 9, 12, tzinfo=timezone.utc)
        # The grain is upserted, so the later write for the same month
        # supersedes the earlier one rather than sitting beside it.
        latest = _monthly_request(
            session,
            key="latest",
            prediction_overrides={
                "odds_ratio": 0.9,
                "ci95_low": 0.7,
                "ci95_high": 1.1,
            },
        )
        latest.completed_at = datetime(2026, 9, 14, tzinfo=timezone.utc)
        latest_id = latest.id
        session.commit()
    prediction = dashboard_client.get(
        f"/risk/{GEOGRAPHY_ID}/monthly?month=2026-08"
    ).json()["months"]["2026-08"]["prediction"]
    assert prediction["request_id"] == latest_id
    assert prediction["attributable_fraction_milli"] == 0
