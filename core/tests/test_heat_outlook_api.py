"""Route tests for the Kenya heat outlook.

Each test publishes a small set of tables shaped like the modeller's CSVs,
then reads them back through the API, so the whole path from the R output to
the HTTP response is exercised: publish, file layout, filtering and the
display rules.
"""

from __future__ import annotations

import csv
from contextlib import nullcontext
import json
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from chart.api.app import app
from chart.auth.schemas import CurrentUserContext
from chart.auth.service import require_current_user
from chart.heat_outlook import routes as outlook_routes
from chart.risk import routes as risk_routes
from chart.heat_outlook import service as outlook_service
from chart.heat_outlook.publish import publish
from chart.risk.schemas import MapArea, MapResponse
from chart.heat_outlook.service import NO_EXCESS_LBW, NO_EXCESS_NEONATAL, THIN_DATA

RELEASE = "v-test"
KAJIADO = "geo-ke-kajiado"


def _write_csv(path: Path, rows: list[dict]) -> None:
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def _period_row(**fields) -> dict:
    base = {
        "gcm_min": 1,
        "gcm_max": 2,
        "change_pct": 1.5,
        "change_low": 0.5,
        "change_high": 2.5,
    }
    return {**fields, **base}


def _lbw_tables(directory: Path) -> None:
    directory.mkdir()
    (directory / "lbw_tmax_dlnm_national_no_altitude.json").write_text(
        json.dumps(
            {
                "model_id": "LBW_test",
                "p0": 0.066,
                "heat_reference_mmt": 24.25,
                "windows": {
                    "P": list(range(9)),
                    "T1": [6, 7, 8],
                    "T2": [3, 4, 5],
                    "T3": [0, 1, 2],
                },
                "window_labels": {
                    "P": "Whole pregnancy",
                    "T1": "1st trimester",
                    "T2": "2nd trimester",
                    "T3": "3rd trimester",
                },
            }
        )
    )
    _write_csv(
        directory / "exposure_response_curves_by_window.csv",
        [
            {"window": "T3", "tmax": 24.25, "or": 1, "or_low": 1, "or_high": 1},
            {"window": "T3", "tmax": 34.25, "or": 0.6, "or_low": 0.3, "or_high": 1.2},
        ],
    )
    typical = []
    for period in ("1981-2010", "2041-2060"):
        for month in range(1, 13):
            row = {
                "ssp": "ssp585",
                "period": period,
                "county": "Kajiado",
                "month": month,
                "tmax": 25 + month * 0.5,
            }
            for window, af in (("P", 0.1), ("T1", -0.02), ("T2", 0.05), ("T3", -0.1)):
                row |= {
                    f"af_heat_{window}_mean": af,
                    f"af_heat_{window}_min": af - 0.01,
                    f"af_heat_{window}_max": af + 0.01,
                }
            typical.append(row)
    _write_csv(directory / "typical_month_heat_LBW_dlnm_county.csv", typical)
    parp = [
        _period_row(
            ssp="ssp585",
            window="P",
            county="Kajiado",
            period=period,
            parp_pct=pct,
            parp_low=pct - 4,
            parp_high=pct + 4,
            share_above_p99_pct=p99,
            share_capped_pct=0,
        )
        for period, pct, p99 in (("1981-2010", 5.5, 0), ("2041-2060", 11.1, 12))
    ]
    _write_csv(directory / "PARP_heat_dlnm_county_by_period.csv", parp)
    _write_csv(
        directory / "PARP_heat_dlnm_national_by_period.csv",
        [{k: v for k, v in row.items() if k != "county"} for row in parp],
    )


def _u5_tables(directory: Path) -> None:
    directory.mkdir()
    (directory / "u5_tmax_dlnm_models.json").write_text(
        json.dumps(
            {
                "version": "u5_test",
                "models": {
                    "neonatal": {
                        "label": "Neonatal (0-27 days)",
                        "status": "main: exact death dates",
                    },
                    "postneonatal": {
                        "label": "Post-neonatal (1-11 months)",
                        "status": "exploratory: approximate death dates",
                    },
                },
            }
        )
    )
    typical = []
    for model, heat in (("neonatal", -0.12), ("postneonatal", 0.04)):
        for period in ("1991-2020", "2041-2060"):
            row = {
                "ssp": "ssp585",
                "period": period,
                "model": model,
                "county": "Kajiado",
                "month": 1,
                "tmax": 28.0,
            }
            for side, value in (("heat", heat), ("cool", 0.03), ("total", heat + 0.03)):
                row |= {
                    f"paf_{side}_mean": value,
                    f"paf_{side}_min": value - 0.01,
                    f"paf_{side}_max": value + 0.01,
                }
            typical.append(row)
    _write_csv(directory / "typical_month_u5_county.csv", typical)
    paf = [
        _period_row(
            ssp="ssp585",
            model=model,
            county="Kajiado",
            side=side,
            period=period,
            paf_pct=value,
            paf_low=value - 3,
            paf_high=value + 3,
            share_days_above_p99_pct=0,
            share_days_capped_pct=0,
        )
        for model, heat in (("neonatal", -11.9), ("postneonatal", 3.4))
        for side, value in (("heat", heat), ("cool", 4.3), ("total", heat + 4.3))
        for period in ("1991-2020", "2041-2060")
    ]
    _write_csv(directory / "PAF_u5_county_by_period.csv", paf)
    _write_csv(
        directory / "PAF_u5_national_by_period.csv",
        [{k: v for k, v in row.items() if k != "county"} for row in paf],
    )


def _user(**overrides) -> CurrentUserContext:
    fields = dict(
        user_id="planner",
        username="planner",
        roles=["health_planning_lead"],
        geography_scopes=["/kenya"],
    )
    return CurrentUserContext(**(fields | overrides))


@pytest.fixture
def client(tmp_path, monkeypatch) -> Iterator[TestClient]:
    _lbw_tables(tmp_path / "lbw_source")
    _u5_tables(tmp_path / "u5_source")
    cache = tmp_path / "models"
    publish(
        tmp_path / "lbw_source",
        tmp_path / "u5_source",
        cache / "kenya" / "outlook" / RELEASE,
        RELEASE,
    )
    monkeypatch.setenv("MODEL_CACHE_DIR", str(cache))
    monkeypatch.setenv("CHART_KENYA_OUTLOOK_RELEASE", RELEASE)
    monkeypatch.setattr(
        risk_routes,
        "_resolve_place_path",
        lambda geography_id: "/kenya" if geography_id == "geo-ke" else "/kenya/kajiado",
    )
    app.dependency_overrides[require_current_user] = lambda: _user()
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(require_current_user, None)


def test_lbw_whole_pregnancy_reads_months_and_periods(client) -> None:
    response = client.get(f"/heat-outlook/{KAJIADO}?outcome=lbw")

    assert response.status_code == 200
    body = response.json()
    assert (body["scenario"], body["period"], body["selector"]) == (
        "ssp585",
        "2041-2060",
        "P",
    )
    assert body["baseline_period"] == "1981–2010"
    assert body["source_uri"].endswith(f"/kenya/outlook/{RELEASE}/lbw/kajiado.json")
    assert len(body["months"]) == 12
    assert body["months"][0]["parts"][0]["value_percent"] == 10.0
    baseline, future = body["period_summary"]
    assert baseline["is_baseline"] and baseline["parts"][0]["change_pp"] is None
    assert future["parts"][0]["value_percent"] == 11.1
    assert future["parts"][0]["thin_data"] is True
    assert future["parts"][0]["message"] == THIN_DATA
    # 11.1% back through AF = 1 - 1/RR and Zhang-Yu with p0 = 0.066.
    ratio = future["parts"][0]["ratio"]
    assert ratio["kind"] == "odds_ratio"
    assert ratio["value"] == pytest.approx(1.1349, abs=1e-3)
    assert ratio["low"] < ratio["value"] < ratio["high"]
    assert ratio["precision"] == "high"


def test_lbw_third_trimester_shows_odds_ratio_without_attributable_share(
    client,
) -> None:
    body = client.get(f"/heat-outlook/{KAJIADO}?outcome=lbw&selector=T3").json()

    month = body["months"][0]
    assert month["parts"][0]["value_percent"] is None
    assert month["parts"][0]["low_percent"] is None
    assert month["parts"][0]["message"] == NO_EXCESS_LBW
    # January's trimester is Nov-Dec-Jan; December (31 °C) is the hottest.
    assert month["odds_ratio"]["at_tmax_c"] == 31.0
    assert month["odds_ratio"]["value"] == pytest.approx(0.73, abs=1e-3)
    assert body["period_summary"] == []
    assert body["selector_note"]


def test_lbw_negative_window_is_suppressed(client) -> None:
    body = client.get(f"/heat-outlook/{KAJIADO}?outcome=lbw&selector=T1").json()

    part = body["months"][0]["parts"][0]
    assert (part["value_percent"], part["message"]) == (None, NO_EXCESS_LBW)


def test_u5_neonatal_heat_carries_the_newborn_note_and_heat_comes_first(client) -> None:
    body = client.get(
        f"/heat-outlook/{KAJIADO}?outcome=under_5_mortality&selector=neonatal"
    ).json()

    assert body["selector"] == "neonatal"
    assert body["baseline_period"] == "1991–2020"
    heat, cool = body["months"][0]["parts"]
    assert (heat["side"], heat["value_percent"], heat["message"]) == (
        "heat",
        None,
        NO_EXCESS_NEONATAL,
    )
    assert (cool["side"], cool["value_percent"]) == ("cool", 3.0)
    assert body["selector_note"] is None


def test_u5_exploratory_age_group_is_labelled(client) -> None:
    body = client.get(f"/heat-outlook/{KAJIADO}?outcome=under_5_mortality").json()

    # Post-neonatal is the default, as agreed with the modeller.
    assert body["selector"] == "postneonatal"
    assert body["selector_note"] == "Approximate death dates."
    assert [o["code"] for o in body["selectors"] if o["exploratory"]] == [
        "postneonatal"
    ]
    assert body["months"][0]["parts"][0]["value_percent"] == 4.0


def test_country_reads_the_national_summary(client) -> None:
    body = client.get("/heat-outlook/geo-ke?outcome=lbw").json()

    assert body["level"] == "country"
    assert body["months"] == []
    assert [p["period"] for p in body["period_summary"]] == ["1981-2010", "2041-2060"]


def test_unpublished_place_and_bad_selection(client) -> None:
    assert client.get("/heat-outlook/geo-ke-narok?outcome=lbw").status_code == 404
    assert client.get("/heat-outlook/geo-in-mp?outcome=lbw").status_code == 404
    response = client.get(f"/heat-outlook/{KAJIADO}?outcome=lbw&scenario=ssp245")
    assert (response.status_code, response.json()["error"]) == (
        422,
        "OUTLOOK_SELECTION_INVALID",
    )


def test_denies_other_geographies_and_roles(client) -> None:
    app.dependency_overrides[require_current_user] = lambda: _user(
        geography_scopes=["/india"]
    )
    assert client.get(f"/heat-outlook/{KAJIADO}?outcome=lbw").status_code == 403
    app.dependency_overrides[require_current_user] = lambda: _user(
        roles=["unknown_role"]
    )
    assert client.get(f"/heat-outlook/{KAJIADO}?outcome=lbw").status_code == 403


def test_rejects_unauthenticated_client() -> None:
    response = TestClient(app).get(f"/heat-outlook/{KAJIADO}?outcome=lbw")
    assert response.status_code in (401, 403)


def test_map_shades_counties_with_the_published_annual_share(
    client, monkeypatch
) -> None:
    frame = MapResponse(
        geography_id="geo-ke",
        outcome="lbw",
        areas=[
            MapArea(
                geography_id=KAJIADO,
                admin_unit_id=1,
                code="kajiado",
                name="Kajiado",
                level="county",
                value_percent=99.0,
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
    # The frame (shapes) comes from the risk map, which needs PostGIS; the test
    # supplies it directly and checks the values laid over it.
    monkeypatch.setattr(outlook_routes, "get_session_factory", lambda: nullcontext)
    calls: list[dict] = []

    def shapes_only(*_args, **kwargs):
        calls.append(kwargs)
        return frame.model_copy(deep=True)

    monkeypatch.setattr(outlook_service, "load_map_view", shapes_only)

    body = client.get("/heat-outlook/geo-ke/map?outcome=lbw").json()
    kajiado, narok = body["areas"]
    assert body["metric"] == "heat_attributable_share_annual_average"
    assert (kajiado["value_percent"], kajiado["missing_reason"]) == (11.1, None)
    assert kajiado["odds_ratio"] == pytest.approx(1.1349, abs=1e-3)
    assert kajiado["on_training_support"] is False  # 12% of months above p99
    assert (narok["value_percent"], narok["missing_reason"]) == (None, "no_model")
    # Only shapes are asked for: the live-prediction queries are skipped.
    assert all(call["with_values"] is False for call in calls)

    t3 = client.get("/heat-outlook/geo-ke/map?outcome=lbw&selector=T3").json()
    assert t3["areas"][0]["missing_reason"] == "not_reported"
    u5 = client.get(
        "/heat-outlook/geo-ke/map?outcome=under_5_mortality&selector=neonatal"
    ).json()
    assert u5["areas"][0]["missing_reason"] == "no_excess"


def test_map_denies_other_geographies_and_roles(client) -> None:
    app.dependency_overrides[require_current_user] = lambda: _user(
        geography_scopes=["/india"]
    )
    assert client.get("/heat-outlook/geo-ke/map?outcome=lbw").status_code == 403
    app.dependency_overrides[require_current_user] = lambda: _user(
        roles=["unknown_role"]
    )
    assert client.get("/heat-outlook/geo-ke/map?outcome=lbw").status_code == 403


def test_map_rejects_unauthenticated_client() -> None:
    app.dependency_overrides.pop(require_current_user, None)
    response = TestClient(app).get("/heat-outlook/geo-ke/map?outcome=lbw")
    assert response.status_code in (401, 403)


def test_ratio_is_withheld_where_the_lbw_conversion_has_no_inverse() -> None:
    document = {"outcome": "lbw", "p0": 0.066}
    row = {"value_pct": 50.0, "low_pct": 10.0, "high_pct": 95.0}
    assert outlook_service._ratio(document, row) is None
    assert outlook_service._ratio(document, {**row, "high_pct": 60.0}) is not None
