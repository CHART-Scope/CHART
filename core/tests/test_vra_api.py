"""End-to-end tests for the vulnerability and resilience assessment (VRA).

Everything goes through the FastAPI app and a real database: CSV uploads,
the climate-derived hazard refresh from ``district_climate``, scoring runs,
and the assessment, map, drill-down and coverage reads. The database is a
SQLite file per test (with the two PostGIS display functions registered as
pass-throughs, as in ``test_risk_map``), or a migrated PostgreSQL/PostGIS
database when ``CHART_E2E_DATABASE_URL`` is set.

The scoring fixture is small enough to check by hand. Five Madhya Pradesh
divisions hold values 0, 1, 2, 3, 4 steps apart; with five areas the 5th and
95th percentiles sit at 0.2 and 3.8 steps, so the scores are
0, 2/9, 1/2, 7/9 and 1 (the ends clipped). Ujjain is missing one month of
peak temperature, so its hazard has 1 of 2 indicators (< 2/3) and it is left
unscored as insufficient data.
"""

from __future__ import annotations

import csv
import io
import json
import os
from collections.abc import Iterator
from datetime import date, datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, func, select

from chart.api.app import app
from chart.auth.schemas import CurrentUserContext
from chart.auth.service import require_current_user, require_reader
from chart.setup.service import restore_deployed_models
from chart.shared.db import session as db_session
from chart.shared.db.base import Base
from chart.shared.db.models import (
    AdminUnit,
    AppGeography,
    ClimateRun,
    CountryGeoConfig,
    DataLabel,
    DataSource,
    DistrictClimate,
    Geography,
    Provenance,
    VraIndicator,
    VraIndicatorValue,
    VraIngestion,
    VraResultIndicator,
    VraRun,
)

MP = "geo-in-madhya-pradesh"
KE = "geo-ke"
DIVISIONS = ("bhopal", "indore", "rewa", "sagar", "ujjain")
COUNTIES = ("kajiado", "narok", "turkana")
WINDOW = [date(2025 + (6 + i) // 12, (6 + i) % 12 + 1, 1) for i in range(12)]
VINTAGE_12M = "2025-07/2026-06"


def division(code: str) -> str:
    return f"{MP}-division-{code}"


def _user(user_id: str, roles: list[str], scopes: list[str]) -> CurrentUserContext:
    return CurrentUserContext(
        user_id=user_id, username=user_id, roles=roles, geography_scopes=scopes
    )


ADMIN = _user("admin", ["chart_admin"], ["/india", "/kenya"])
PLANNER = _user("planner", ["health_planning_lead"], ["/india/madhya-pradesh"])
KENYA_ADMIN = _user("kenya-admin", ["chart_admin"], ["/kenya"])


def _square(index: int, postgres: bool) -> str:
    west, south = 74.0 + index, 21.0
    ring = [
        (west, south),
        (west + 1, south),
        (west + 1, south + 1),
        (west, south + 1),
        (west, south),
    ]
    if postgres:
        points = ", ".join(f"{x} {y}" for x, y in ring)
        return f"SRID=4326;MULTIPOLYGON((({points})))"
    return json.dumps({"type": "Polygon", "coordinates": [[list(p) for p in ring]]})


def _seed_places(session, postgres: bool) -> None:
    session.add_all(
        CountryGeoConfig(country_code=country, level_key=level, level_label=label)
        for country, level, label in (
            ("IN", "state", "State"),
            ("IN", "geo_level_1", "Division"),
            ("KE", "country", "Country"),
            ("KE", "geo_level_1", "County"),
        )
    )
    session.flush()
    for slug, country, name, root, root_path, children, label in (
        (
            "in-mp",
            "India",
            "Madhya Pradesh",
            MP,
            "/india/madhya-pradesh",
            DIVISIONS,
            "Division",
        ),
        ("ke", "Kenya", "Kenya", KE, "/kenya", COUNTIES, "County"),
    ):
        geography = Geography(slug=slug, country=country, name=name)
        session.add(geography)
        session.flush()
        country_code = "IN" if slug == "in-mp" else "KE"
        session.add(
            AppGeography(
                id=root,
                country_code=country_code,
                level="country" if country_code == "KE" else "state",
                level_label="Country" if country_code == "KE" else "State",
                name=name,
                path=root_path,
            )
        )
        session.flush()
        for index, code in enumerate(children):
            child_id = division(code) if country_code == "IN" else f"{KE}-{code}"
            session.add(
                AppGeography(
                    id=child_id,
                    country_code=country_code,
                    level="geo_level_1",
                    level_label=label,
                    name=code.title(),
                    parent_id=root,
                    path=f"{root_path}/{code}",
                    sort_order=index,
                )
            )
            session.flush()
            session.add(
                AdminUnit(
                    geography_id=geography.id,
                    app_geography_id=child_id,
                    level=label.lower(),
                    code=code,
                    name=code.title(),
                    bbox_west=74.0 + index,
                    bbox_south=21.0,
                    bbox_east=75.0 + index,
                    bbox_north=22.0,
                    boundary=_square(index, postgres),
                )
            )
    session.commit()


@pytest.fixture
def factory(tmp_path, monkeypatch):
    url = os.getenv("CHART_E2E_DATABASE_URL") or f"sqlite:///{tmp_path / 'vra.db'}"
    postgres = url.startswith("postgresql")
    monkeypatch.setenv("DATABASE_URL", url)
    engine = db_session.get_engine(url)
    if postgres:
        # A migrated, disposable database: start every test from empty tables.
        with engine.begin() as connection:
            for table in reversed(Base.metadata.sorted_tables):
                connection.execute(table.delete())
    else:

        @event.listens_for(engine, "connect")
        def _register_geometry_stubs(dbapi_connection, _record):
            for name in ("ST_SimplifyPreserveTopology", "SimplifyPreserveTopology"):
                dbapi_connection.create_function(name, 2, lambda geometry, _t: geometry)
            for name in ("ST_AsGeoJSON", "AsGeoJSON"):
                dbapi_connection.create_function(name, 1, lambda geometry: geometry)

        Base.metadata.create_all(engine)
    session_factory = db_session.get_session_factory(url)
    with session_factory() as session:
        _seed_places(session, postgres)
    yield session_factory
    db_session.dispose_engines()


@pytest.fixture
def as_user(factory) -> Iterator:
    """Sign in as a given user for the following requests."""

    current = {"user": ADMIN}
    app.dependency_overrides[require_current_user] = lambda: current["user"]
    app.dependency_overrides[require_reader] = app.dependency_overrides[
        require_current_user
    ]

    def switch(user: CurrentUserContext) -> TestClient:
        current["user"] = user
        return TestClient(app)

    try:
        yield switch
    finally:
        app.dependency_overrides.pop(require_current_user, None)
        app.dependency_overrides.pop(require_reader, None)


def _csv(rows: list[tuple]) -> str:
    lines = [
        "area_code,area_name,indicator_code,value,vintage,source_name,source_url,notes"
    ]
    for row in rows:
        lines.append(",".join(str(v) for v in row))
    return "\n".join(lines) + "\n"


def _row(area, indicator, value, vintage="2011", source="Census of India 2011"):
    return (
        area,
        area.title(),
        indicator,
        value,
        vintage,
        source,
        "https://example.org/census",
        "",
    )


def _fixture_rows() -> list[tuple]:
    rows = []
    for step, area in enumerate(DIVISIONS):
        rows += [
            _row(area, "exp.population_density", 100 * (step + 1)),
            _row(area, "sens.child_0_6_share", 10 * (step + 1)),
            _row(area, "sens.anaemia_women", 10 * (step + 1), "2019-21", "NFHS-5"),
            _row(area, "ac.women_10yr_schooling", 50 - 10 * step, "2019-21", "NFHS-5"),
            # Identical everywhere: no spread, so it cannot be scored.
            _row(area, "sens.elderly_share", 7),
        ]
    # Only two areas: too few to set bounds.
    rows += [
        _row("bhopal", "exp.workers_share", 40),
        _row("indore", "exp.workers_share", 45),
    ]
    return rows


def _upload(client: TestClient, body: str, geography: str = MP, name="values.csv"):
    return client.post(
        f"/vra/{geography}/values?file_name={name}",
        content=body.encode("utf-8"),
        headers={"content-type": "text/csv"},
    )


def _seed_climate(factory) -> None:
    """Twelve observed ERA5 months for the divisions, plus decoys to ignore."""

    with factory() as session:
        source = DataSource(name="Copernicus ERA5 single levels", kind="reanalysis")
        session.add(source)
        session.flush()

        def run(label: DataLabel, tag: str) -> ClimateRun:
            provenance = Provenance(source_uri=f"test://{tag}", input_hash=tag * 8)
            session.add(provenance)
            session.flush()
            row = ClimateRun(
                data_source_id=source.id,
                provenance_id=provenance.id,
                tier="observed",
                source_name="ERA5",
                input_hash=tag * 16,
                data_label=label,
                generated_at=datetime(2026, 7, 5, tzinfo=timezone.utc),
            )
            session.add(row)
            session.flush()
            return row

        observed = run(DataLabel.reanalysis, "obs1")
        sample = run(DataLabel.sample, "smp1")
        units = {
            unit.code: unit.id
            for unit in session.scalars(
                select(AdminUnit).where(AdminUnit.code.in_(DIVISIONS))
            )
        }
        for step, code in enumerate(DIVISIONS):
            for month in WINDOW:
                incomplete = code == "ujjain" and month == date(2026, 1, 1)
                for variable, value in (
                    ("heatwave_days", float(step)),
                    ("tmax_monthly_max_c", 40.0 + step),
                ):
                    session.add(
                        DistrictClimate(
                            admin_unit_id=units[code],
                            climate_run_id=observed.id,
                            period_month=month,
                            variable=variable,
                            value=value,
                            unit="days" if variable == "heatwave_days" else "degC",
                            observed_days=(
                                20 if incomplete and variable != "heatwave_days" else 31
                            ),
                            expected_days=31,
                        )
                    )
            # A later month of fixture data must never move the window.
            session.add(
                DistrictClimate(
                    admin_unit_id=units[code],
                    climate_run_id=sample.id,
                    period_month=date(2026, 7, 1),
                    variable="heatwave_days",
                    value=99.0,
                )
            )
        session.commit()


def _prepared(as_user, factory) -> TestClient:
    client = as_user(ADMIN)
    _seed_climate(factory)
    response = _upload(client, _csv(_fixture_rows()))
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "completed"
    return client


# --- catalogue -------------------------------------------------------------

CONTRACT_CODES = {
    "haz.heatwave_days_12m", "haz.tmax_monthly_max_12m", "haz.flood_events",
    "haz.drought_events", "haz.extreme_hot_days_change", "haz.very_hot_days_change",
    "haz.warm_nights_change", "haz.extreme_warm_nights_change", "haz.heat_index_days",
    "haz.projected_extreme_hot_days", "haz.projected_warm_nights",
    "haz.extremely_heavy_rain_days", "haz.very_heavy_rain_days", "haz.max_24h_rainfall",
    "haz.projected_heavy_rain_days", "haz.utci_heat_stress_days",
    "haz.flood_inundated_area", "haz.cyclone_events",
    "exp.population_density", "exp.workers_share", "exp.agri_workers_share",
    "exp.construction_workers_share", "exp.vet_facilities",
    "sens.child_0_6_share", "sens.elderly_share", "sens.slum_population_share",
    "sens.women_20_49_share", "sens.adolescent_girls_share", "sens.disability_share",
    "sens.high_blood_sugar_women", "sens.high_blood_sugar_men", "sens.high_bp_women",
    "sens.high_bp_men", "sens.anaemia_women", "sens.child_stunting",
    "sens.child_wasting", "sens.child_underweight", "sens.child_overweight",
    "sens.infant_mortality", "sens.groundwater_extraction_stage",
    "sens.flood_susceptibility", "sens.heat_susceptibility",
    "sens.drought_susceptibility", "sens.roads_flood_susceptibility",
    "sens.forest_cover_change", "sens.green_space_per_person", "sens.malaria_incidence",
    "sens.hiv_prevalence", "sens.cyclone_susceptibility",
    "ac.women_10yr_schooling", "ac.men_10yr_schooling", "ac.full_vaccination",
    "ac.health_insurance", "ac.oop_delivery_public", "ac.improved_water_source",
    "ac.improved_sanitation", "ac.clean_cooking_fuel", "ac.vehicle_ownership",
    "ac.destitute_households", "ac.phone_internet_access",
    "ac.health_facilities_per_100k", "ac.health_workforce_gap", "ac.school_tap_water",
    "ac.school_toilet_water", "ac.heat_illness_surveillance", "ac.heat_action_plan",
    "ac.road_density", "ac.multidimensional_poverty", "ctx.dmhp_coverage",
    "ctx.state_health_adaptation_plan", "ac.sentinel_hospitals", "ac.one_health_units",
}  # fmt: skip


def test_catalogue_lists_every_contract_indicator(as_user) -> None:
    response = as_user(PLANNER).get("/vra/indicators")

    assert response.status_code == 200
    items = {item["code"]: item for item in response.json()["items"]}
    assert set(items) == CONTRACT_CODES
    assert items["haz.heatwave_days_12m"]["route"] == "computed"
    assert items["ac.women_10yr_schooling"]["direction_to_risk"] == -1
    assert items["ac.oop_delivery_public"]["direction_to_risk"] == 1
    assert items["sens.green_space_per_person"]["direction_to_risk"] == -1
    assert items["ctx.dmhp_coverage"]["status"] == "context"
    assert items["haz.cyclone_events"]["status"] == "dropped"
    assert items["sens.malaria_incidence"]["route"] == "manual"
    assert all(item["rationale"] for item in items.values())


def test_startup_sync_is_idempotent_and_restores_edits(as_user, factory) -> None:
    restore_deployed_models(session_factory=factory)
    with factory() as session:
        row = session.scalar(
            select(VraIndicator).where(VraIndicator.code == "exp.population_density")
        )
        row.name = "edited"
        session.commit()
    restore_deployed_models(session_factory=factory)

    with factory() as session:
        assert session.scalar(select(func.count()).select_from(VraIndicator)) == 72
        row = session.scalar(
            select(VraIndicator).where(VraIndicator.code == "exp.population_density")
        )
        assert row.name == "Population density"


# --- uploads ---------------------------------------------------------------


def test_upload_accepts_valid_rows_and_rejects_each_bad_row(as_user, factory) -> None:
    client = as_user(ADMIN)
    body = _csv(
        [
            _row("bhopal", "exp.population_density", 250),  # row 2
            _row("atlantis", "exp.population_density", 1),  # 3
            _row("kajiado", "exp.population_density", 1),  # 4: a Kenyan county
            _row("bhopal", "exp.nope", 1),  # 5
            _row("bhopal", "haz.heatwave_days_12m", 1),  # 6: computed
            _row("bhopal", "sens.hiv_prevalence", 1),  # 7: dropped
            _row("bhopal", "sens.child_0_6_share", "abc"),  # 8
            _row("bhopal", "sens.child_0_6_share", 150),  # 9: not a percentage
            _row("bhopal", "sens.child_0_6_share", 12, vintage=""),  # 10
            _row("bhopal", "exp.population_density", 260),  # 11: duplicate
            _row("indore", "sens.child_0_6_share", ""),  # 12: blank, skipped
            _row("INDORE", "sens.child_0_6_share", 14.5),  # 13
        ]
    )

    response = _upload(client, body, name="census.csv")

    assert response.status_code == 200, response.text
    result = response.json()
    assert (result["status"], result["rows_accepted"], result["rows_rejected"]) == (
        "completed",
        2,
        9,
    )
    reasons = {item["row"]: item["reason"] for item in result["rejections"]}
    assert sorted(reasons) == [3, 4, 5, 6, 7, 8, 9, 10, 11]
    assert "not an area of this frame" in reasons[4]
    assert "not in the catalogue" in reasons[5]
    assert "computed by CHART" in reasons[6]
    assert "dropped" in reasons[7]
    assert "not a number" in reasons[8]
    assert "0-100" in reasons[9]
    assert reasons[10] == "vintage is required"
    assert "duplicate" in reasons[11]

    with factory() as session:
        stored = {
            (row.vintage, row.value, row.source_name, row.ingestion_id)
            for row in session.scalars(select(VraIndicatorValue))
        }
        ingestion = session.scalar(select(VraIngestion))
    assert stored == {
        ("2011", 250.0, "Census of India 2011", result["ingestion_id"]),
        ("2011", 14.5, "Census of India 2011", result["ingestion_id"]),
    }
    assert (ingestion.file_name, ingestion.requested_by) == ("census.csv", "admin")
    assert len(ingestion.file_sha256) == 64


def test_upload_with_no_valid_row_fails_and_writes_nothing(as_user, factory) -> None:
    client = as_user(ADMIN)

    response = _upload(
        client,
        _csv([_row("atlantis", "exp.population_density", 1), _row("bhopal", "x", 2)]),
    )

    assert response.status_code == 200
    assert response.json()["status"] == "failed"
    assert response.json()["rows_accepted"] == 0
    with factory() as session:
        assert session.scalar(select(func.count()).select_from(VraIndicatorValue)) == 0
    coverage = client.get(f"/vra/{MP}/coverage").json()
    assert coverage["ingestions"][0]["status"] == "failed"
    assert coverage["ingestions"][0]["rows_rejected"] == 2

    bad_header = _upload(client, "region,value\nbhopal,1\n")
    assert (bad_header.status_code, bad_header.json()["error"]) == (
        422,
        "VRA_CSV_HEADER_INVALID",
    )


def test_reupload_updates_in_place_and_new_vintage_is_used(as_user, factory) -> None:
    client = as_user(ADMIN)
    _upload(client, _csv([_row("bhopal", "exp.population_density", 250)]))
    _upload(client, _csv([_row("bhopal", "exp.population_density", 275)]))

    with factory() as session:
        rows = list(session.scalars(select(VraIndicatorValue)))
    assert [(row.vintage, row.value) for row in rows] == [("2011", 275.0)]

    _upload(
        client,
        _csv([_row("bhopal", "exp.population_density", 300, vintage="2025")]),
    )
    detail = client.get(f"/vra/{MP}/areas/{division('bhopal')}").json()
    density = next(
        i for i in detail["indicators"] if i["code"] == "exp.population_density"
    )
    assert (density["raw"], density["vintage"]) == (300.0, "2025")
    assert detail["area"]["missing_reason"] == "not_assessed"


def test_template_lists_every_area_and_hand_entered_indicator(as_user) -> None:
    client = as_user(ADMIN)
    indicators = client.get("/vra/indicators").json()["items"]
    expected = [i["code"] for i in indicators if i["uploadable"]]

    response = client.get(f"/vra/{MP}/template.csv")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    rows = list(csv.DictReader(io.StringIO(response.text)))
    assert list(rows[0]) == [
        "area_code",
        "area_name",
        "indicator_code",
        "value",
        "vintage",
        "source_name",
        "source_url",
        "notes",
        "indicator_name",
        "unit",
        "expected_values",
        "example_value",
    ]
    assert len(rows) == len(DIVISIONS) * len(expected)
    assert rows[0]["area_code"] == "bhopal"
    assert rows[0]["indicator_code"] == expected[0]
    assert all(row["value"] == row["vintage"] == "" for row in rows)
    assert all(
        row["unit"] and row["expected_values"] and row["example_value"] for row in rows
    )


# --- computed hazard -------------------------------------------------------


def test_run_computes_hazard_from_the_latest_twelve_complete_months(
    as_user, factory
) -> None:
    client = as_user(ADMIN)
    _seed_climate(factory)

    assert client.post(f"/vra/{MP}/runs").status_code == 200

    with factory() as session:
        rows = session.execute(
            select(VraIndicator.code, AdminUnit.code, VraIndicatorValue)
            .join(VraIndicator, VraIndicator.id == VraIndicatorValue.indicator_id)
            .join(AdminUnit, AdminUnit.id == VraIndicatorValue.admin_unit_id)
        ).all()
    values = {(code, area): row for code, area, row in rows}
    heat = values[("haz.heatwave_days_12m", "sagar")]
    # Sagar: 3 heatwave days in each of the 12 months; the sample July is ignored.
    assert (heat.value, heat.vintage, heat.method) == (36.0, VINTAGE_12M, "computed")
    assert heat.quality_flags["months"] == 12
    assert heat.climate_run_id is not None
    assert values[("haz.tmax_monthly_max_12m", "rewa")].value == pytest.approx(42.0)
    # Ujjain's January is incomplete, so it has no 12-month peak temperature.
    assert ("haz.tmax_monthly_max_12m", "ujjain") not in values
    assert values[("haz.heatwave_days_12m", "ujjain")].value == 48.0


# --- scoring ---------------------------------------------------------------


def test_run_scores_the_hand_checked_fixture(as_user, factory) -> None:
    client = _prepared(as_user, factory)

    response = client.post(f"/vra/{MP}/runs")

    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["geography_id"], body["name"], body["area_level_label"]) == (
        MP,
        "Madhya Pradesh",
        "Division",
    )
    run = body["run"]
    assert (run["method_version"], run["weights"], run["area_count"]) == (
        "vra-v1",
        "equal",
        5,
    )
    # heatwave, tmax, density, child 0-6, anaemia, schooling. Elderly (no
    # spread) and workers (two areas) are excluded.
    assert run["indicator_count"] == 6

    areas = {area["code"]: area for area in body["areas"]}
    assert [a["code"] for a in body["areas"]] == [
        "sagar",
        "rewa",
        "indore",
        "bhopal",
        "ujjain",
    ]
    two_ninths, seven_ninths = 2 / 9, 7 / 9
    # Peak temperature over four areas: bounds 40.15 and 42.85.
    hazard = {
        "bhopal": 0.0,
        "indore": (two_ninths + 0.85 / 2.7) / 2,
        "rewa": (0.5 + 1.85 / 2.7) / 2,
        "sagar": (seven_ninths + 1.0) / 2,
    }
    scaled = {"bhopal": 0.0, "indore": two_ninths, "rewa": 0.5, "sagar": seven_ninths}
    for code in hazard:
        components = areas[code]["components"]
        assert components["hazard"] == pytest.approx(hazard[code])
        assert components["exposure"] == pytest.approx(scaled[code])
        assert components["sensitivity"] == pytest.approx(scaled[code])
        # More schooling, more capacity: bhopal (50%) has the most.
        assert components["adaptive_capacity"] == pytest.approx(1 - scaled[code])
        assert components["vulnerability"] == pytest.approx(scaled[code])
        expected_risk = (max(hazard[code], 0.01) * max(scaled[code], 0.01) ** 2) ** (
            1 / 3
        )
        assert areas[code]["risk"] == pytest.approx(expected_risk)

    assert areas["bhopal"]["risk"] == pytest.approx(0.01)  # floored at 0.01
    assert [areas[c]["rank"] for c in ("sagar", "rewa", "indore", "bhopal")] == [
        1,
        2,
        3,
        4,
    ]
    assert [areas[c]["risk_class"] for c in ("sagar", "rewa", "indore", "bhopal")] == [
        "very_high",
        "high",
        "moderate",
        "low",
    ]
    risks = sorted(areas[c]["risk"] for c in hazard)
    assert run["class_breaks"] == pytest.approx(
        [
            risks[0] + 0.75 * (risks[1] - risks[0]),
            (risks[1] + risks[2]) / 2,
            risks[2] + 0.25 * (risks[3] - risks[2]),
        ]
    )

    ujjain = areas["ujjain"]
    assert (ujjain["risk"], ujjain["rank"], ujjain["risk_class"]) == (None, None, None)
    assert ujjain["missing_reason"] == "insufficient_data"
    assert ujjain["components"]["hazard"] is None
    assert ujjain["coverage"] == {
        "hazard": 0.5,
        "exposure": 1.0,
        "sensitivity": 1.0,
        "adaptive_capacity": 1.0,
    }
    # Largest contribution first: density and schooling are their component's
    # only indicator (weight 1); anaemia and child 0-6 share sensitivity.
    assert [d["code"] for d in ujjain["drivers"]] == [
        "ac.women_10yr_schooling",
        "exp.population_density",
        "sens.anaemia_women",
    ]
    assert [d["code"] for d in areas["sagar"]["drivers"]] == [
        "haz.tmax_monthly_max_12m"
    ]
    assert areas["sagar"]["drivers"][0]["normalised"] == pytest.approx(1.0)

    with factory() as session:
        stored = session.scalar(select(VraRun))
    bounds = stored.params["bounds"]
    assert (
        bounds["exp.population_density"]["lo"],
        bounds["exp.population_density"]["hi"],
    ) == pytest.approx((120.0, 480.0))
    assert bounds["sens.elderly_share"]["excluded_reason"] == "no_spread"
    assert bounds["exp.workers_share"]["excluded_reason"] == "too_few_areas"
    assert bounds["haz.flood_events"]["excluded_reason"] == "no_data"


def test_area_drill_down_explains_every_indicator(as_user, factory) -> None:
    client = _prepared(as_user, factory)
    client.post(f"/vra/{MP}/runs")

    response = as_user(PLANNER).get(f"/vra/{MP}/areas/{division('sagar')}")

    assert response.status_code == 200
    body = response.json()
    assert body["area"]["rank"] == 1
    indicators = {item["code"]: item for item in body["indicators"]}
    included = [
        i
        for i in client.get("/vra/indicators").json()["items"]
        if i["status"] == "included"
    ]
    assert len(indicators) == len(included)

    density = indicators["exp.population_density"]
    assert density["raw"] == 400.0 and density["vintage"] == "2011"
    assert density["normalised"] == pytest.approx(7 / 9)
    assert (density["weight"], density["contribution"]) == pytest.approx((1.0, 7 / 9))
    assert density["source_name"] == "Census of India 2011"
    assert density["method"] == "observed"
    schooling = indicators["ac.women_10yr_schooling"]
    # 20% schooling: direction -1 flips 2/9 to 7/9 towards risk.
    assert (schooling["raw"], schooling["normalised"]) == pytest.approx((20.0, 7 / 9))
    heat = indicators["haz.heatwave_days_12m"]
    assert (heat["method"], heat["vintage"]) == ("computed", VINTAGE_12M)
    assert heat["quality_flags"]["variable"] == "heatwave_days"
    assert indicators["sens.elderly_share"]["excluded_reason"] == "no_spread"
    assert indicators["sens.elderly_share"]["raw"] == 7.0
    assert indicators["exp.workers_share"]["excluded_reason"] == "too_few_areas"
    flood = indicators["haz.flood_events"]
    assert (flood["raw"], flood["excluded_reason"]) == (None, "no_data")

    other = client.get(f"/vra/{MP}/areas/{KE}-kajiado")
    assert (other.status_code, other.json()["error"]) == (404, "VRA_AREA_NOT_FOUND")


def test_map_shades_areas_by_risk_with_reasons(as_user, factory) -> None:
    _prepared(as_user, factory)

    before = as_user(PLANNER).get(f"/vra/{MP}/map").json()
    assert {a["missing_reason"] for a in before["areas"]} == {"not_assessed"}
    assert as_user(PLANNER).get(f"/vra/{MP}/assessment").json()["run"] is None

    assessment = as_user(ADMIN).post(f"/vra/{MP}/runs").json()
    body = as_user(PLANNER).get(f"/vra/{MP}/map").json()

    assert (body["outcome"], body["metric"], body["unit"]) == (
        "vra",
        "vra_risk",
        "score",
    )
    assert len(body["bounds"]) == 4
    areas = {area["code"]: area for area in body["areas"]}
    assert set(areas) == set(DIVISIONS)
    risks = {area["code"]: area["risk"] for area in assessment["areas"]}
    assert areas["sagar"]["value_percent"] == pytest.approx(risks["sagar"] * 100)
    assert areas["sagar"]["geometry"]["type"] in ("Polygon", "MultiPolygon")
    assert (areas["ujjain"]["value_percent"], areas["ujjain"]["missing_reason"]) == (
        None,
        "insufficient_data",
    )
    # A division is framed on its siblings, as on the dashboard map.
    leaf = as_user(PLANNER).get(f"/vra/{division('rewa')}/map").json()
    assert {a["code"] for a in leaf["areas"]} == set(DIVISIONS)
    leaf_assessment = as_user(PLANNER).get(f"/vra/{division('rewa')}/assessment")
    assert leaf_assessment.json()["geography_id"] == MP


def test_identical_runs_reproduce_identical_output(as_user, factory) -> None:
    client = _prepared(as_user, factory)

    first = client.post(f"/vra/{MP}/runs").json()
    second = client.post(f"/vra/{MP}/runs").json()

    assert first["run"]["id"] != second["run"]["id"]
    assert first["run"]["input_hash"] == second["run"]["input_hash"]
    assert first["run"]["output_hash"] == second["run"]["output_hash"]
    assert first["areas"] == second["areas"]
    with factory() as session:
        counts = session.execute(
            select(VraResultIndicator.run_id, func.count()).group_by(
                VraResultIndicator.run_id
            )
        ).all()
    assert len(counts) == 2 and counts[0][1] == counts[1][1]

    # A changed input changes both hashes.
    _upload(client, _csv([_row("bhopal", "exp.population_density", 150)]))
    third = client.post(f"/vra/{MP}/runs").json()
    assert third["run"]["input_hash"] != first["run"]["input_hash"]
    assert third["run"]["output_hash"] != first["run"]["output_hash"]


# --- access ----------------------------------------------------------------


def test_non_admins_cannot_write_or_read_coverage(as_user) -> None:
    planner = as_user(PLANNER)

    assert planner.get(f"/vra/{MP}/assessment").status_code == 200
    for method, path in (
        ("post", f"/vra/{MP}/runs"),
        ("get", f"/vra/{MP}/coverage"),
        ("get", f"/vra/{MP}/template.csv"),
    ):
        response = getattr(planner, method)(path)
        assert (response.status_code, response.json()["error"]) == (
            403,
            "ROLE_NOT_ALLOWED",
        )
    denied = _upload(planner, _csv([_row("bhopal", "exp.population_density", 1)]))
    assert denied.status_code == 403


def test_out_of_scope_and_unknown_geographies_are_refused(as_user, factory) -> None:
    kenya_admin = as_user(KENYA_ADMIN)

    for response in (
        kenya_admin.get(f"/vra/{MP}/assessment"),
        kenya_admin.get(f"/vra/{MP}/map"),
        kenya_admin.get(f"/vra/{MP}/areas/{division('bhopal')}"),
        kenya_admin.post(f"/vra/{MP}/runs"),
        _upload(kenya_admin, _csv([_row("bhopal", "exp.population_density", 1)])),
    ):
        assert (response.status_code, response.json()["error"]) == (
            403,
            "GEOGRAPHY_OUT_OF_SCOPE",
        )
    with factory() as session:
        assert session.scalar(select(func.count()).select_from(VraIngestion)) == 0

    missing = as_user(ADMIN).get("/vra/geo-nowhere/assessment")
    assert (missing.status_code, missing.json()["error"]) == (
        404,
        "GEOGRAPHY_NOT_FOUND",
    )
    app.dependency_overrides.pop(require_current_user, None)
    app.dependency_overrides.pop(require_reader, None)
    assert TestClient(app).get(f"/vra/{MP}/assessment").status_code == 401


def test_kenya_frame_is_isolated_from_madhya_pradesh_values(as_user, factory) -> None:
    _prepared(as_user, factory)
    kenya_admin = as_user(KENYA_ADMIN)

    coverage = kenya_admin.get(f"/vra/{KE}/coverage").json()
    assert coverage["area_count"] == len(COUNTIES)
    assert all(item["present"] == 0 for item in coverage["indicators"])
    assert coverage["ingestions"] == []

    upload = _upload(
        kenya_admin,
        _csv(
            [
                _row("kajiado", "exp.population_density", 90, vintage="2019"),
                _row("bhopal", "exp.population_density", 90, vintage="2019"),
            ]
        ),
        geography=KE,
    )
    assert upload.json()["rows_accepted"] == 1
    assert "not an area of this frame" in upload.json()["rejections"][0]["reason"]

    body = kenya_admin.post(f"/vra/{KE}/runs").json()
    assert body["area_level_label"] == "County"
    assert {area["code"] for area in body["areas"]} == set(COUNTIES)
    assert {area["missing_reason"] for area in body["areas"]} == {"insufficient_data"}
    assert body["run"]["indicator_count"] == 0

    # The Madhya Pradesh assessment is untouched by the Kenyan run.
    mp = as_user(ADMIN).get(f"/vra/{MP}/coverage").json()
    density = next(i for i in mp["indicators"] if i["code"] == "exp.population_density")
    assert (density["present"], density["vintages"]) == (5, ["2011"])
