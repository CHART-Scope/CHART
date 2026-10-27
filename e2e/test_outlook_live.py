"""Real application requests after importing the supplied handover into PostGIS."""

import json
import os
from pathlib import Path

import httpx
import pytest
from sqlalchemy import create_engine, text


@pytest.fixture(scope="module")
def client():
    with httpx.Client(base_url=os.environ["CHART_E2E_API"], timeout=90) as value:
        yield value


@pytest.fixture(scope="module")
def tokens():
    result = {}
    for username in ("india-planner", "kenya-planner", "district-planner", "denied"):
        response = httpx.post(
            os.environ["CHART_E2E_IDENTITY"]
            + "/realms/chart/protocol/openid-connect/token",
            data={
                "client_id": "chart-web",
                "grant_type": "password",
                "username": username,
                "password": os.environ["CHART_E2E_PASSWORD"],
            },
        )
        assert response.is_success, "Disposable identity login failed"
        result[username] = {
            "Authorization": "Bearer " + response.json()["access_token"]
        }
    return result


@pytest.fixture(scope="module")
def geographies(client):
    response = client.get("/geographies", params={"include_unsupported": "true"})
    assert response.status_code == 200
    return response.json()


def test_served_openapi_matches_published_geography_contract(client):
    response = client.get("/openapi.json")
    assert response.status_code == 200, response.text
    schema = response.json()
    documented = Path(__file__).resolve().parents[1] / "docs/openapi/climate.json"
    assert schema == json.loads(documented.read_text())
    capability = schema["paths"]["/heat-outlook/{geography_id}/capabilities"]["get"]
    assert "projection only" in capability["description"]
    assert "OUTLOOK_NOT_PUBLISHED" in capability["description"]
    properties = schema["components"]["schemas"]["HeatOutlookResponse"]["properties"]
    assert properties["level"]["type"] == "string"
    assert "enum" not in properties["level"]
    assert "metadata_note" in properties
    assert (
        "total"
        in schema["components"]["schemas"]["MonthPart"]["properties"]["side"]["enum"]
    )


@pytest.mark.parametrize(
    "country,level,count", [("IN", "District", 52), ("KE", "Constituency", 289)]
)
def test_import_persists_complete_hierarchy_and_retries_are_idempotent(
    client, geographies, country, level, count
):
    places = [
        g
        for g in geographies
        if g["countryCode"] == country and g["levelLabel"] == level
    ]
    assert len(places) == count
    by_id = {g["id"]: g for g in geographies}
    assert len(by_id) == len(geographies)
    for place in places:
        assert place["parentId"] in by_id
        assert place["path"].startswith(by_id[place["parentId"]]["path"] + "/")
    engine = create_engine(os.environ["DATABASE_URL"])
    with engine.connect() as connection:
        for place in places:
            persisted = connection.execute(
                text("SELECT path, parent_id FROM geographies WHERE id=:id"),
                {"id": place["id"]},
            ).one()
            assert persisted.path == place["path"]
            assert persisted.parent_id == place["parentId"]
    engine.dispose()


@pytest.mark.parametrize(
    "country,level,user",
    [("IN", "District", "india-planner"), ("KE", "Constituency", "kenya-planner")],
)
@pytest.mark.parametrize("outcome", ["lbw", "under_5_mortality"])
def test_period_selection_fine_geographies_and_missing_data(
    client, tokens, geographies, country, level, user, outcome
):
    place = next(
        g
        for g in geographies
        if g["countryCode"] == country and g["levelLabel"] == level
    )
    path = "/heat-outlook/" + place["id"]
    response = client.get(path, params={"outcome": outcome}, headers=tokens[user])
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["geography_id"] == place["id"]
    assert data["data_modes"] == ["projection"]
    assert len(data["months"]) == 12
    capability = client.get(
        path + "/capabilities", params={"outcome": outcome}, headers=tokens[user]
    )
    assert capability.status_code == 200, capability.text
    assert capability.json() == {
        "published": True,
        "data_modes": ["projection"],
        "level": data["level"],
    }
    for duration in (5, 10, 20):
        period = next(
            p["code"]
            for p in data["periods"]
            if int(p["code"][-4:]) - int(p["code"][:4]) + 1 == duration
        )
        selected = client.get(
            path,
            params={"outcome": outcome, "period": period, "scenario": "ssp585"},
            headers=tokens[user],
        )
        assert selected.status_code == 200, selected.text
        selected_data = selected.json()
        assert selected_data["period"] == period
        assert selected_data["scenario"] == "ssp585"
        assert len(selected_data["months"]) == 12
        row = next(p for p in selected_data["period_summary"] if p["period"] == period)
        assert row["parts"]
        assert all(p["change_pp"] is not None for p in row["parts"])
    invalid = client.get(
        path, params={"outcome": outcome, "period": "2098-2107"}, headers=tokens[user]
    )
    assert invalid.status_code == 422
    invalid_selector = client.get(
        path,
        params={"outcome": outcome, "selector": "missing-model"},
        headers=tokens[user],
    )
    assert invalid_selector.status_code == 422
    unsupported = client.get(
        path, params={"outcome": "unpublished-outcome"}, headers=tokens[user]
    )
    assert unsupported.status_code == 404
    # Future downscaling/calibration has deliberately not been claimed.
    observed = client.get(
        path + "/observed", params={"outcome": outcome}, headers=tokens[user]
    )
    assert observed.status_code == 404
    # A fresh HTTP request must reproduce the selection from durable output.
    assert (
        client.get(path, params={"outcome": outcome}, headers=tokens[user]).json()
        == data
    )


def test_authentication_roles_and_country_isolation(client, tokens, geographies):
    india = next(
        g
        for g in geographies
        if g["countryCode"] == "IN" and g["levelLabel"] == "District"
    )
    kenya = next(
        g
        for g in geographies
        if g["countryCode"] == "KE" and g["levelLabel"] == "Constituency"
    )
    for suffix in ("", "/map", "/capabilities"):
        assert client.get("/heat-outlook/" + india["id"] + suffix).status_code == 401
        assert (
            client.get(
                "/heat-outlook/" + india["id"] + suffix,
                headers={"Authorization": "Bearer invalid"},
            ).status_code
            == 401
        )
        assert (
            client.get(
                "/heat-outlook/" + india["id"] + suffix, headers=tokens["denied"]
            ).status_code
            == 403
        )
        assert (
            client.get(
                "/heat-outlook/" + india["id"] + suffix, headers=tokens["kenya-planner"]
            ).status_code
            == 403
        )
        assert (
            client.get(
                "/heat-outlook/" + kenya["id"] + suffix, headers=tokens["india-planner"]
            ).status_code
            == 403
        )
    assert (
        client.get(
            "/heat-outlook/no-such-geography", headers=tokens["india-planner"]
        ).status_code
        == 404
    )


def test_publish_browser_fixture(geographies):
    """Only non-sensitive geography IDs are passed to the browser suite."""
    selected = {
        country: next(
            g
            for g in geographies
            if g["countryCode"] == country and g["levelLabel"] == label
        )
        for country, label in [("IN", "District"), ("KE", "Constituency")]
    }
    (Path(os.environ["CHART_E2E_EVIDENCE"]) / "browser-fixture.json").write_text(
        json.dumps(selected)
    )


def test_published_and_derived_values_match_independent_modeller_reference(
    client, tokens
):
    """Regression: finer areas and short periods must keep scientific meaning.

    Baseline: modeller PARP_heat_dlnm_district_by_period.csv, Bhopal SSP126 P.
    Derived: independently computed equal-month/polygon-intersection area
    average from five source grids for 2027–2031 (not averages of 20-year CSVs).
    """
    response = client.get(
        "/heat-outlook/geo-in-madhya-pradesh-district-bhopal",
        params={
            "outcome": "lbw",
            "period": "2027-2031",
            "scenario": "ssp126",
            "selector": "P",
        },
        headers=tokens["india-planner"],
    )
    assert response.status_code == 200, response.text
    rows = {row["period"]: row["parts"][0] for row in response.json()["period_summary"]}
    assert rows["1981-2010"]["value_percent"] == pytest.approx(24.747)
    assert rows["1981-2010"]["low_percent"] == pytest.approx(14.115)
    derived = rows["2027-2031"]
    assert derived["value_percent"] == pytest.approx(25.50184843590363, abs=1e-6)
    assert derived["gcm_min_percent"] == pytest.approx(22.129931262964917, abs=1e-6)
    assert derived["gcm_max_percent"] == pytest.approx(27.992866479903316, abs=1e-6)
    assert derived["change_pp"] == pytest.approx(0.5361192931922799, abs=1e-6)
    assert derived["low_percent"] is None
    assert derived["high_percent"] is None
    assert derived["change_low_pp"] is None


@pytest.mark.parametrize(
    "place,user",
    [
        ("geo-in-madhya-pradesh-division-bhopal", "india-planner"),
        ("geo-ke-mombasa", "kenya-planner"),
    ],
)
def test_fine_map_polygons_values_and_scope(client, tokens, geographies, place, user):
    result = client.get(
        "/heat-outlook/" + place + "/map",
        params={"outcome": "lbw", "period": "2027-2031"},
        headers=tokens[user],
    )
    assert result.status_code == 200, result.text
    areas = result.json()["areas"]
    assert areas
    by_id = {g["id"]: g for g in geographies}
    for area in areas:
        assert by_id[area["geography_id"]]["parentId"] == place
        assert area["geometry"]["type"] in {"Polygon", "MultiPolygon"}
        assert area["geometry"]["coordinates"]
        assert area["value_percent"] is not None or area["missing_reason"] is not None


def test_leaf_scoped_user_never_receives_siblings(client, tokens):
    leaf = "/heat-outlook/geo-in-madhya-pradesh-district-bhopal"
    for suffix in ("", "/map"):
        response = client.get(
            leaf + suffix, params={"outcome": "lbw"}, headers=tokens["district-planner"]
        )
        assert response.status_code == 200, response.text
        if suffix:
            assert len(response.json()["areas"]) == 1
            assert all(
                area["geography_id"] == leaf.rsplit("/", 1)[-1]
                for area in response.json()["areas"]
            )
    denied_parent = client.get(
        "/heat-outlook/geo-in-madhya-pradesh-division-bhopal/map",
        headers=tokens["district-planner"],
    )
    assert denied_parent.status_code == 403
    denied_sibling = client.get(
        "/heat-outlook/geo-in-madhya-pradesh-district-rajgarh",
        headers=tokens["district-planner"],
    )
    assert denied_sibling.status_code == 403


def test_country_settings_persist_without_cross_country_leakage(client, tokens):
    original = client.get(
        "/model-settings",
        params={"country": "KE", "outcome": "lbw"},
        headers=tokens["kenya-planner"],
    )
    assert original.status_code == 200, original.text
    settings = original.json()["settings"]
    restricted = {**settings, "scenarios": ["ssp585"], "default_scenario": "ssp585"}
    try:
        saved = client.put(
            "/model-settings/KE/lbw", json=restricted, headers=tokens["kenya-planner"]
        )
        assert saved.status_code == 200, saved.text
        reloaded = client.get(
            "/model-settings",
            params={"country": "KE", "outcome": "lbw"},
            headers=tokens["kenya-planner"],
        )
        assert reloaded.json()["settings"]["scenarios"] == ["ssp585"]
        kenya = client.get(
            "/heat-outlook/geo-ke-constituency-changamwe",
            params={"outcome": "lbw", "scenario": "ssp126"},
            headers=tokens["kenya-planner"],
        )
        assert kenya.status_code == 422
        india = client.get(
            "/heat-outlook/geo-in-madhya-pradesh-district-bhopal",
            params={"outcome": "lbw", "scenario": "ssp126"},
            headers=tokens["india-planner"],
        )
        assert india.status_code == 200, india.text
        denied = client.put(
            "/model-settings/KE/lbw", json=restricted, headers=tokens["india-planner"]
        )
        assert denied.status_code == 403
    finally:
        restored = client.put(
            "/model-settings/KE/lbw", json=settings, headers=tokens["kenya-planner"]
        )
        assert restored.status_code == 200, restored.text


def test_missing_advertised_document_is_explicit_and_recovers(client, tokens):
    """Only the disposable cache is changed; the original handover is untouched."""
    path = (
        Path(os.environ["MODEL_CACHE_DIR"])
        / "outlooks/geo-ke-constituency-changamwe/lbw.json"
    )
    original = path.read_bytes()
    try:
        path.unlink()
        missing = client.get(
            "/heat-outlook/geo-ke-constituency-changamwe",
            headers=tokens["kenya-planner"],
        )
        assert missing.status_code == 404
        assert missing.json()["error"] == "OUTLOOK_NOT_PUBLISHED"
        observed = client.get(
            "/heat-outlook/geo-ke-constituency-changamwe/observed",
            headers=tokens["kenya-planner"],
        )
        assert observed.status_code == 404
        capability = client.get(
            "/heat-outlook/geo-ke-constituency-changamwe/capabilities",
            headers=tokens["kenya-planner"],
        )
        assert capability.status_code == 404
        assert capability.json()["error"] == "OUTLOOK_NOT_PUBLISHED"
    finally:
        path.write_bytes(original)
    recovered = client.get(
        "/heat-outlook/geo-ke-constituency-changamwe", headers=tokens["kenya-planner"]
    )
    assert recovered.status_code == 200, recovered.text
