"""Route tests for Kenya's observed months, scored from ERA5 with the DLNM.

The database holds ERA5 rows the way the climate pipeline writes them; the
API reads them, applies the release's calibration, scores them with the
modeller's models and applies the display rules. The scorer itself is held to
the modeller's own validation cases from R.
"""

from __future__ import annotations

import csv
import json
import math
from calendar import monthrange
from collections.abc import Iterator
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from chart.api.app import app
from chart.auth.schemas import CurrentUserContext
from chart.auth.service import require_current_user, require_reader
from chart.heat_outlook import dlnm, observed
from chart.heat_outlook import routes as outlook_routes
from chart.heat_outlook.service import NO_EXCESS_LBW, NO_EXCESS_NEONATAL
from chart.model_settings import service as settings_service
from chart.risk import routes as risk_routes
from chart.risk.schemas import MapArea, MapResponse
from chart.shared.db.base import Base
from chart.shared.db.models import (
    AdminUnit,
    AppGeography,
    ClimateRun,
    CountryGeoConfig,
    DataLabel,
    DataSource,
    DistrictClimate,
    DistrictClimateDay,
    Geography,
    Provenance,
)

SHIPPED = "v2_2026_10_06"
FIXTURES = Path(__file__).parent / "fixtures" / "kenya_dlnm"
KAJIADO = "geo-ke-kajiado"
GARISSA = "geo-ke-garissa"
OFFSET_C = 0.5


def _cases(name: str) -> list[dict[str, str]]:
    with (FIXTURES / name).open() as handle:
        return list(csv.DictReader(handle))


def test_lbw_scorer_matches_the_modellers_r_results() -> None:
    model = dlnm.lbw_model(SHIPPED)
    for row in _cases("lbw_validation_cases.csv"):
        lags = [float(row[f"tmax_lag{k}"]) for k in range(9)]
        for window in ("P", "T1", "T2", "T3"):
            score = model.score(lags, window)
            af = 1 - 1 / dlnm.or_to_rr(score.ratio, model.p0)
            assert score.log_ratio == pytest.approx(
                float(row[f"expected_log_or_{window}"]), abs=1e-3
            )
            assert score.se == pytest.approx(
                float(row[f"expected_se_{window}"]), abs=1e-3
            )
            assert af == pytest.approx(
                float(row[f"expected_af_heat_{window}"]), abs=1e-3
            )


def test_u5_scorer_matches_the_modellers_r_results() -> None:
    models = dlnm.u5_models(SHIPPED)
    for row in _cases("u5_validation_cases.csv"):
        lags = [float(row[f"tmax_lag{k}"]) for k in models.lags]
        for name in models.models:
            for side in ("heat", "cool"):
                score = models.score(lags, float(row["ref_tmax"]), name, side)
                assert score.log_ratio == pytest.approx(
                    float(row[f"expected_log_or_{side}_{name}"]), abs=1e-3
                )
                assert score.se == pytest.approx(
                    float(row[f"expected_se_{side}_{name}"]), abs=1e-3
                )


# A release with the shipped models and a test calibration for Kajiado.
@pytest.fixture
def release(tmp_path, monkeypatch) -> str:
    name = f"v-observed-{tmp_path.name}"
    directory = tmp_path / "releases" / name
    directory.mkdir(parents=True)
    for path in dlnm.release_dir(SHIPPED).iterdir():
        if path.name != "calibration.json":
            (directory / path.name).symlink_to(path)
    (directory / "calibration.json").write_text(
        json.dumps(
            {
                "note": "test calibration",
                "counties": {
                    county: {"offset_c": [OFFSET_C] * 12, "u5_reference_tmax_c": 28.54}
                    for county in (KAJIADO, GARISSA)
                },
            }
        )
    )
    monkeypatch.setattr(dlnm, "RELEASES_DIR", tmp_path / "releases")
    monkeypatch.setenv("CHART_KENYA_OUTLOOK_RELEASE", name)
    # Local publications must not replace this fixture's calibrated legacy release.
    monkeypatch.setenv("MODEL_CACHE_DIR", str(tmp_path / "models"))
    return name


@pytest.fixture
def factory(monkeypatch):
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    with factory() as session:
        session.add(
            CountryGeoConfig(
                country_code="KE", level_key="country", level_label="Country"
            )
        )
        session.flush()
        session.add(
            AppGeography(
                id="geo-ke",
                country_code="KE",
                level="country",
                level_label="Country",
                name="Kenya",
                path="/kenya",
            )
        )
        session.add(
            CountryGeoConfig(
                country_code="KE", level_key="county", level_label="County"
            )
        )
        session.flush()
        geography = Geography(slug="kenya", country="Kenya", name="Kenya")
        session.add(geography)
        session.flush()
        for slug, name in (
            ("kajiado", "Kajiado"),
            ("narok", "Narok"),
            ("garissa", "Garissa"),
        ):
            session.add(
                AppGeography(
                    id=f"geo-ke-{slug}",
                    country_code="KE",
                    level="county",
                    level_label="County",
                    name=name,
                    parent_id="geo-ke",
                    path=f"/kenya/{slug}",
                )
            )
            session.flush()
            session.add(
                AdminUnit(
                    geography_id=geography.id,
                    app_geography_id=f"geo-ke-{slug}",
                    level="county",
                    code=slug.upper(),
                    name=name,
                )
            )
        session.commit()
    monkeypatch.setattr(settings_service, "get_session_factory", lambda: factory)
    monkeypatch.setattr(outlook_routes, "get_session_factory", lambda: factory)
    return factory


def _run(session, label: DataLabel, generated: datetime) -> ClimateRun:
    unique = uuid4().hex
    source = DataSource(name=f"ERA5 {unique}", kind="reanalysis")
    provenance = Provenance(source_uri="cds://era5", input_hash=f"p{unique}")
    session.add_all([source, provenance])
    session.flush()
    run = ClimateRun(
        data_source_id=source.id,
        provenance_id=provenance.id,
        tier="observed",
        input_hash=f"run{unique}",
        data_label=label,
        generated_at=generated,
    )
    session.add(run)
    session.flush()
    return run


def _county(session, geography_id: str = KAJIADO) -> AdminUnit:
    return session.query(AdminUnit).filter_by(app_geography_id=geography_id).one()


def _months_back(month: date, count: int) -> date:
    index = month.year * 12 + month.month - 1 - count
    return date(index // 12, index % 12 + 1, 1)


def _seed_months(factory, birth_month: date, lags: list[float], **options) -> None:
    """ERA5 monthly rows so that ``lags[k]`` is the model-scale Tmax k months back."""

    with factory() as session:
        run = _run(
            session,
            options.get("label", DataLabel.reanalysis),
            options.get("generated", datetime(2026, 9, 1, tzinfo=timezone.utc)),
        )
        unit = _county(session, options.get("county", KAJIADO))
        for lag, tmax in enumerate(lags):
            month = _months_back(birth_month, lag)
            days = monthrange(month.year, month.month)[1]
            partial = options.get("partial_month") == month
            session.add(
                DistrictClimate(
                    admin_unit_id=unit.id,
                    climate_run_id=run.id,
                    period_month=month,
                    variable="tmax_monthly_mean_c",
                    value=tmax - OFFSET_C,
                    observed_days=days - 3 if partial else days,
                    expected_days=days,
                )
            )
        session.commit()


def _user(**overrides) -> CurrentUserContext:
    fields = dict(
        user_id="planner",
        username="planner",
        roles=["health_planning_lead"],
        geography_scopes=["/kenya"],
    )
    return CurrentUserContext(**(fields | overrides))


@pytest.fixture
def client(release, factory, monkeypatch) -> Iterator[TestClient]:
    monkeypatch.setattr(
        risk_routes,
        "_resolve_place_path",
        lambda geography_id: "/kenya" if geography_id == "geo-ke" else "/kenya/kajiado",
    )
    app.dependency_overrides[require_current_user] = lambda: _user()
    app.dependency_overrides[require_reader] = app.dependency_overrides[
        require_current_user
    ]
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(require_current_user, None)
        app.dependency_overrides.pop(require_reader, None)


def _enable(client: TestClient, outcome: str, selectors: list[str], default: str):
    response = client.put(
        f"/model-settings/KE/{outcome}",
        json={
            "selectors": selectors,
            "default_selector": default,
            "scenarios": [],
            "default_scenario": None,
            "data_modes": ["observed"],
        },
    )
    assert response.status_code == 200, response.text


def test_lbw_month_reproduces_the_modellers_validation_case(client, factory) -> None:
    case = _cases("lbw_validation_cases.csv")[0]
    lags = [float(case[f"tmax_lag{k}"]) for k in range(9)]
    _seed_months(factory, date(2026, 7, 1), lags)

    response = client.get(f"/heat-outlook/{KAJIADO}/observed?outcome=lbw")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["month"] == "2026-07"
    assert body["available_months"] == ["2026-07"]
    assert body["selector"] == "P"
    assert body["place"] == "Kajiado County"
    expected = 100 * float(case["expected_af_heat_P"])
    assert body["estimate"]["value_percent"] == pytest.approx(expected, abs=0.01)
    assert body["estimate"]["ratio"]["kind"] == "odds_ratio"
    assert body["estimate"]["ratio"]["value"] == pytest.approx(
        math.exp(float(case["expected_log_or_P"])), abs=1e-3
    )
    # The inputs show both scales, newest month first, all counted for P.
    assert [item["label"] for item in body["inputs"]][:2] == ["Jul 2026", "Jun 2026"]
    assert body["inputs"][0]["model_scale_c"] == pytest.approx(lags[0], abs=0.01)
    assert body["inputs"][0]["era5_c"] == pytest.approx(lags[0] - OFFSET_C, abs=0.01)
    assert all(item["counted"] for item in body["inputs"])
    assert len(body["history"]) == 1


def test_months_without_nine_complete_months_are_not_offered(client, factory) -> None:
    lags = [float(value) for value in range(30, 21, -1)]
    _seed_months(factory, date(2026, 7, 1), lags, partial_month=date(2026, 2, 1))

    body = client.get(f"/heat-outlook/{KAJIADO}/observed?outcome=lbw").json()

    # February is partial, so no birth month whose window includes it scores.
    assert body["available_months"] == []
    assert body["month"] is None and body["estimate"] is None
    missing = client.get(f"/heat-outlook/{KAJIADO}/observed?outcome=lbw&month=2026-07")
    assert missing.status_code == 422
    assert missing.json()["error"] == "OUTLOOK_SELECTION_INVALID"


def test_newest_run_wins_and_projections_are_ignored(client, factory) -> None:
    case = _cases("lbw_validation_cases.csv")[0]
    lags = [float(case[f"tmax_lag{k}"]) for k in range(9)]
    _seed_months(factory, date(2026, 7, 1), [lag + 5 for lag in lags])
    _seed_months(
        factory,
        date(2026, 7, 1),
        lags,
        generated=datetime(2026, 10, 1, tzinfo=timezone.utc),
    )
    _seed_months(
        factory,
        date(2026, 7, 1),
        [40.0] * 9,
        label=DataLabel.projection,
        generated=datetime(2026, 11, 1, tzinfo=timezone.utc),
    )

    body = client.get(f"/heat-outlook/{KAJIADO}/observed?outcome=lbw").json()

    assert body["estimate"]["value_percent"] == pytest.approx(
        100 * float(case["expected_af_heat_P"]), abs=0.01
    )


def test_lbw_third_trimester_keeps_the_guides_message(client, factory) -> None:
    _enable(client, "lbw", ["P", "T1", "T2", "T3"], "P")
    _seed_months(factory, date(2026, 7, 1), [31.0] * 9)

    body = client.get(
        f"/heat-outlook/{KAJIADO}/observed?outcome=lbw&selector=T3"
    ).json()

    assert body["estimate"]["value_percent"] is None
    assert body["estimate"]["message"] == NO_EXCESS_LBW
    assert body["selector_note"] is not None
    # Only the third-trimester months (lags 0-2) count.
    assert [item["counted"] for item in body["inputs"]] == [True] * 3 + [False] * 6


def test_disabled_selector_is_refused(client, factory) -> None:
    _seed_months(factory, date(2026, 7, 1), [31.0] * 9)

    response = client.get(f"/heat-outlook/{KAJIADO}/observed?outcome=lbw&selector=T1")

    assert response.status_code == 422


def _seed_days(factory, first: date, last: date, tmax) -> None:
    with factory() as session:
        run = _run(
            session, DataLabel.reanalysis, datetime(2026, 9, 1, tzinfo=timezone.utc)
        )
        unit = _county(session)
        day = first
        while day <= last:
            session.add(
                DistrictClimateDay(
                    admin_unit_id=unit.id,
                    climate_run_id=run.id,
                    period_date=day,
                    variable="tmax_c",
                    value=tmax(day) - OFFSET_C,
                )
            )
            day += timedelta(days=1)
        session.commit()


def test_u5_month_is_the_mean_of_its_days(client, factory) -> None:
    _enable(
        client,
        "under_5_mortality",
        ["neonatal", "postneonatal", "under5"],
        "postneonatal",
    )

    def tmax(day: date) -> float:
        return 27 + (day.day % 7)

    # The three days before June are needed for June 1st's lags.
    _seed_days(factory, date(2026, 5, 29), date(2026, 6, 30), tmax)

    body = client.get(
        f"/heat-outlook/{KAJIADO}/observed?outcome=under_5_mortality"
    ).json()

    assert body["available_months"] == ["2026-06"]
    models = dlnm.u5_models(SHIPPED)
    shares = []
    for n in range(30):
        day = date(2026, 6, 1) + timedelta(days=n)
        lags = [tmax(day - timedelta(days=lag)) for lag in range(4)]
        score = models.score(lags, 28.54, "postneonatal", "heat")
        shares.append(100 * (1 - 1 / score.ratio))
    assert body["estimate"]["value_percent"] == pytest.approx(
        sum(shares) / len(shares), abs=0.01
    )
    assert body["estimate"]["ratio"]["kind"] == "risk_ratio"
    assert body["selectors"][0]["code"] == "neonatal"

    neonatal = client.get(
        f"/heat-outlook/{KAJIADO}/observed?outcome=under_5_mortality&selector=neonatal"
    ).json()
    assert neonatal["estimate"]["value_percent"] is None
    assert neonatal["estimate"]["message"] == NO_EXCESS_NEONATAL


def test_u5_needs_the_three_days_before_the_month(client, factory) -> None:
    _seed_days(factory, date(2026, 6, 1), date(2026, 6, 30), lambda _day: 30.0)

    body = client.get(
        f"/heat-outlook/{KAJIADO}/observed?outcome=under_5_mortality"
    ).json()

    assert body["available_months"] == []


def test_uncalibrated_or_unknown_places(client, factory) -> None:
    narok = client.get("/heat-outlook/geo-ke-narok/observed?outcome=lbw")
    assert narok.status_code == 200
    assert narok.json()["available_months"] == []
    unknown = client.get("/heat-outlook/geo-in-mp/observed?outcome=lbw")
    assert unknown.status_code == 404
    assert unknown.json()["error"] == "OBSERVED_NOT_AVAILABLE"


def test_denies_other_geographies_roles_and_anonymous(client) -> None:
    app.dependency_overrides[require_current_user] = lambda: _user(
        geography_scopes=["/india"]
    )
    app.dependency_overrides[require_reader] = app.dependency_overrides[
        require_current_user
    ]
    assert client.get(f"/heat-outlook/{KAJIADO}/observed").status_code == 403
    assert client.get(f"/heat-outlook/{KAJIADO}/observed/map").status_code == 403
    app.dependency_overrides.pop(require_current_user, None)
    app.dependency_overrides.pop(require_reader, None)
    assert client.get(f"/heat-outlook/{KAJIADO}/observed").status_code == 401


def test_kenya_needs_half_its_counties_for_a_month(client, factory) -> None:
    # Kajiado scores Jul and Aug 2026, Garissa only Jul; Narok has no
    # calibration and scores nothing. Two of three counties make July.
    _seed_months(factory, date(2026, 8, 1), [31.0] * 10)
    _seed_months(factory, date(2026, 7, 1), [32.0] * 9, county=GARISSA)

    body = client.get("/heat-outlook/geo-ke/observed?outcome=lbw").json()

    assert body["place"] == "Kenya" and body["level"] == "country"
    assert body["available_months"] == ["2026-07"]
    assert body["estimate"]["counties"] == 2
    assert body["inputs"] == []  # inputs are listed for a county only
    # Kajiado can show August, but opens on July so its map is full.
    county = client.get(f"/heat-outlook/{KAJIADO}/observed?outcome=lbw").json()
    assert county["available_months"] == ["2026-07", "2026-08"]
    assert county["month"] == "2026-07"
    august = client.get(f"/heat-outlook/{KAJIADO}/observed?outcome=lbw&month=2026-08")
    assert august.status_code == 200 and august.json()["month"] == "2026-08"


def test_map_shades_scored_counties_only(client, factory, monkeypatch) -> None:
    case = _cases("lbw_validation_cases.csv")[0]
    _seed_months(
        factory, date(2026, 7, 1), [float(case[f"tmax_lag{k}"]) for k in range(9)]
    )

    def shapes_only(*_args, **_kwargs) -> MapResponse:
        return MapResponse(
            geography_id="geo-ke",
            outcome="lbw",
            areas=[
                MapArea(
                    geography_id=KAJIADO,
                    admin_unit_id=1,
                    code="kajiado",
                    name="Kajiado",
                    level="county",
                ),
                MapArea(
                    geography_id="geo-ke-narok",
                    admin_unit_id=2,
                    code="narok",
                    name="Narok",
                    level="county",
                ),
            ],
        )

    monkeypatch.setattr(observed, "load_map_view", shapes_only)

    response = client.get("/heat-outlook/geo-ke/observed/map?outcome=lbw&month=2026-07")

    assert response.status_code == 200, response.text
    areas = {area["geography_id"]: area for area in response.json()["areas"]}
    assert areas[KAJIADO]["value_percent"] == pytest.approx(
        100 * float(case["expected_af_heat_P"]), abs=0.01
    )
    assert areas["geo-ke-narok"]["value_percent"] is None
    assert areas["geo-ke-narok"]["missing_reason"] == "not_reported"
    assert response.json()["metric"] == "heat_attributable_share_observed_month"
    unknown = client.get("/heat-outlook/geo-ke/observed/map?outcome=lbw&month=2020-01")
    assert unknown.status_code == 422
