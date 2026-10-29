"""Real application requests after importing the supplied handover into PostGIS."""

import json
import os
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text


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
    assert "No district or constituency inherits" in capability["description"]
    assert "OUTLOOK_NOT_PUBLISHED" in capability["description"]
    properties = schema["components"]["schemas"]["HeatOutlookResponse"]["properties"]
    assert properties["level"]["type"] == "string"
    assert "enum" not in properties["level"]
    assert "metadata_note" in properties
    assert (
        "total"
        in schema["components"]["schemas"]["MonthPart"]["properties"]["side"]["enum"]
    )
    capabilities = schema["components"]["schemas"]["OutlookCapabilities"]
    assert {"observed", "projection_release", "data_modes"} <= set(
        capabilities["properties"]
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
        "projection_release": data["release"],
        "observed": {
            "source": None,
            "release": None,
            "reason": "No observed model is available for this place and outcome.",
            "model_area_name": None,
            "batch_enabled": False,
        },
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


@pytest.mark.parametrize("outcome", ["lbw", "under_5_mortality"])
def test_existing_kenya_observed_survives_new_projection_release(
    client, tokens, geographies, outcome
):
    path = "/heat-outlook/geo-ke-kajiado"
    headers = tokens["kenya-planner"]
    capabilities = client.get(
        path + "/capabilities", params={"outcome": outcome}, headers=headers
    )
    assert capabilities.status_code == 200, capabilities.text
    support = capabilities.json()
    assert set(support["data_modes"]) == {"observed", "projection"}
    assert support["projection_release"] == "2026-10-22"
    assert support["observed"]["source"] == "outlook"
    assert support["observed"]["release"] == "v2_2026_10_06"
    response = client.get(
        path + "/observed",
        params={"outcome": outcome, "month": "2026-09"},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["release"] == "v2_2026_10_06"
    assert data["month"] == "2026-09"
    assert data["estimate"] is not None
    assert data["inputs"]
    if outcome == "lbw":
        # The supplied R validation case 1, through actual HTTP, auth and PostGIS.
        assert data["estimate"]["value_percent"] == pytest.approx(21.27, abs=0.01)
    projection = client.get(
        path, params={"outcome": outcome, "period": "2027-2031"}, headers=headers
    )
    assert projection.status_code == 200, projection.text
    assert projection.json()["release"] == "2026-10-22"
    assert projection.json()["data_modes"] == ["projection"]
    repeated = client.get(
        path + "/observed",
        params={"outcome": outcome, "month": "2026-09"},
        headers=headers,
    )
    assert repeated.json() == data
    mapped = client.get(
        "/heat-outlook/geo-ke/observed/map",
        params={"outcome": outcome, "month": "2026-09"},
        headers=headers,
    )
    assert mapped.status_code == 200, mapped.text
    assert any(
        area["geography_id"] == "geo-ke-kajiado" for area in mapped.json()["areas"]
    )
    county_map = client.get(
        path + "/observed/map",
        params={"outcome": outcome, "month": "2026-09"},
        headers=headers,
    )
    assert county_map.status_code == 200, county_map.text
    areas = county_map.json()["areas"]
    children = {geo["id"] for geo in geographies if geo["parentId"] == "geo-ke-kajiado"}
    assert children
    assert {area["geography_id"] for area in areas} == children
    assert all(area["value_percent"] is None for area in areas)
    assert all(area["missing_reason"] == "no_model" for area in areas)
    county = next(
        area
        for area in mapped.json()["areas"]
        if area["geography_id"] == "geo-ke-kajiado"
    )
    assert county["value_percent"] == data["estimate"]["value_percent"]


@pytest.mark.parametrize("outcome", ["lbw", "under_5_mortality"])
def test_existing_india_monthly_results_remain_separate_from_new_projection(
    client, tokens, outcome
):
    place = "geo-in-madhya-pradesh-division-bhopal"
    headers = tokens["india-planner"]
    response = client.get(
        f"/heat-outlook/{place}/capabilities",
        params={"outcome": outcome},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    support = response.json()
    assert set(support["data_modes"]) == {"observed", "projection"}
    assert support["observed"]["source"] == "monthly"
    assert support["observed"]["model_area_name"] == "Bhopal"
    assert support["projection_release"] == "2026-10-22"
    response = client.get(
        f"/risk/{place}/monthly", params={"outcome": outcome}, headers=headers
    )
    assert response.status_code == 200, response.text
    result = response.json()["months"]["2026-09"]["prediction"]
    assert result["model_release_id"] == support["observed"]["release"]
    assert result["odds_ratio"] == (1.25 if outcome == "lbw" else 1.1)
    engine = create_engine(os.environ["DATABASE_URL"])
    with engine.connect() as connection:
        persisted = connection.execute(
            text(
                "SELECT odds_ratio FROM prediction_result p JOIN admin_unit a ON a.id=p.admin_unit_id WHERE p.model_release_id=:release AND p.valid_month='2026-09-01' AND a.app_geography_id=:place"
            ),
            {"release": result["model_release_id"], "place": place},
        ).scalar_one()
        assert persisted == result["odds_ratio"]
    engine.dispose()
    # The Kenya observed engine must never manufacture Indian observed values.
    assert (
        client.get(
            f"/heat-outlook/{place}/observed",
            params={"outcome": outcome},
            headers=headers,
        ).status_code
        == 404
    )


@pytest.mark.parametrize(
    "place,user",
    [
        ("geo-in-madhya-pradesh-district-bhopal", "india-planner"),
        ("geo-ke-constituency-changamwe", "kenya-planner"),
    ],
)
def test_unsupported_observed_has_reason_and_never_uses_parent_model(
    client, tokens, place, user
):
    for outcome in ("lbw", "under_5_mortality"):
        response = client.get(
            f"/heat-outlook/{place}/capabilities",
            params={"outcome": outcome},
            headers=tokens[user],
        )
        assert response.status_code == 200, response.text
        data = response.json()
        assert data["data_modes"] == ["projection"]
        assert data["observed"]["source"] is None
        assert data["observed"]["reason"]
        assert (
            client.get(
                f"/heat-outlook/{place}/observed",
                params={"outcome": outcome},
                headers=tokens[user],
            ).status_code
            == 404
        )


@pytest.mark.parametrize(
    "parent,child,user,other_user",
    [
        (
            "geo-in-madhya-pradesh-division-gwalior",
            "geo-in-madhya-pradesh-district-gwalior",
            "india-planner",
            "kenya-planner",
        ),
        (
            "geo-ke-kajiado",
            "geo-ke-constituency-kajiado-central",
            "kenya-planner",
            "india-planner",
        ),
    ],
)
@pytest.mark.parametrize("outcome", ["lbw", "under_5_mortality"])
def test_observed_drilldown_keeps_boundaries_without_inheriting_parent_values(
    client, tokens, geographies, parent, child, user, other_user, outcome
):
    params = {"outcome": outcome, "month": "2026-09"}
    expected_children = {geo["id"] for geo in geographies if geo["parentId"] == parent}
    assert child in expected_children
    # A country-scoped leaf selection keeps its sibling map for comparison.
    # The separate leaf-scope regression below must return only the allowed leaf.
    for place in (parent, child):
        path = f"/heat-outlook/{place}/observed/map"
        response = client.get(path, params=params, headers=tokens[user])
        assert response.status_code == 200, response.text
        areas = response.json()["areas"]
        assert {area["geography_id"] for area in areas} == expected_children
        for area in areas:
            assert area["geometry"]["type"] in {"Polygon", "MultiPolygon"}
            assert area["geometry"]["coordinates"]
            assert area["value_percent"] is None
            assert area["missing_reason"] == "no_model"
        assert client.get(path, params=params).status_code == 401
        assert (
            client.get(path, params=params, headers=tokens["denied"]).status_code == 403
        )
        assert (
            client.get(path, params=params, headers=tokens[other_user]).status_code
            == 403
        )
    assert (
        client.get(
            f"/heat-outlook/{child}/observed", params=params, headers=tokens[user]
        ).status_code
        == 404
    )
    # Parent availability remains independent from its uncalibrated children.
    capability = client.get(
        f"/heat-outlook/{parent}/capabilities",
        params={"outcome": outcome},
        headers=tokens[user],
    )
    assert capability.status_code == 200, capability.text
    assert capability.json()["observed"]["source"] in {"monthly", "outlook"}


def test_observed_boundary_only_map_still_isolates_leaf_scope(client, tokens):
    path = "/heat-outlook/geo-in-madhya-pradesh-district-bhopal/observed/map"
    response = client.get(path, headers=tokens["district-planner"])
    assert response.status_code == 200, response.text
    assert [area["geography_id"] for area in response.json()["areas"]] == [
        "geo-in-madhya-pradesh-district-bhopal"
    ]
    assert response.json()["areas"][0]["value_percent"] is None
    for place in (
        "geo-in-madhya-pradesh-division-bhopal",
        "geo-in-madhya-pradesh-district-rajgarh",
    ):
        assert (
            client.get(
                f"/heat-outlook/{place}/observed/map",
                headers=tokens["district-planner"],
            ).status_code
            == 403
        )


def test_restored_observed_still_enforces_auth_and_scopes(client, tokens):
    for suffix in ("/capabilities", "/observed", "/observed/map"):
        path = "/heat-outlook/geo-ke-kajiado" + suffix
        assert client.get(path).status_code == 401
        assert client.get(path, headers=tokens["india-planner"]).status_code == 403
        assert client.get(path, headers=tokens["denied"]).status_code == 403
    for suffix in ("/capabilities", "/observed"):
        path = "/heat-outlook/geo-in-madhya-pradesh-division-bhopal" + suffix
        assert client.get(path, headers=tokens["district-planner"]).status_code == 403
    path = "/risk/geo-in-madhya-pradesh-division-bhopal/monthly"
    assert client.get(path).status_code == 401
    assert client.get(path, headers=tokens["kenya-planner"]).status_code == 403


def test_projection_publication_failure_does_not_disable_existing_observed(
    client, tokens
):
    path = Path(os.environ["MODEL_CACHE_DIR"]) / "outlooks/geo-ke-kajiado/lbw.json"
    original = path.read_bytes()
    headers = tokens["kenya-planner"]
    endpoint = "/heat-outlook/geo-ke-kajiado"
    try:
        path.unlink()
        capabilities = client.get(endpoint + "/capabilities", headers=headers)
        assert capabilities.status_code == 200, capabilities.text
        assert capabilities.json()["data_modes"] == ["observed"]
        assert capabilities.json()["published"] is False
        assert client.get(endpoint, headers=headers).status_code == 404
        response = client.get(endpoint + "/observed", headers=headers)
        assert response.status_code == 200, response.text
        assert response.json()["month"] == "2026-09"
    finally:
        path.write_bytes(original)
    assert set(
        client.get(endpoint + "/capabilities", headers=headers).json()["data_modes"]
    ) == {"observed", "projection"}


def test_incomplete_observations_are_not_replaced_by_projected_or_parent_values(
    client, tokens
):
    engine = create_engine(os.environ["DATABASE_URL"])
    statement = text(
        "SELECT dc.id, dc.observed_days FROM district_climate dc JOIN admin_unit a ON a.id=dc.admin_unit_id WHERE a.app_geography_id='geo-ke-kajiado' AND dc.period_month='2026-09-01'"
    )
    with engine.begin() as connection:
        row = connection.execute(statement).one()
        connection.execute(
            text("UPDATE district_climate SET observed_days=1 WHERE id=:id"),
            {"id": row.id},
        )
    try:
        response = client.get(
            "/heat-outlook/geo-ke-kajiado/observed", headers=tokens["kenya-planner"]
        )
        assert response.status_code == 200, response.text
        assert response.json()["month"] is None
        assert response.json()["estimate"] is None
        assert response.json()["available_months"] == []
    finally:
        with engine.begin() as connection:
            connection.execute(
                text("UPDATE district_climate SET observed_days=:days WHERE id=:id"),
                {"id": row.id, "days": row.observed_days},
            )
        engine.dispose()
    response = client.get(
        "/heat-outlook/geo-ke-kajiado/observed", headers=tokens["kenya-planner"]
    )
    assert response.json()["month"] == "2026-09"


@pytest.mark.parametrize(
    "country,place,user",
    [
        ("KE", "geo-ke-kajiado", "kenya-planner"),
        ("IN", "geo-in-madhya-pradesh-division-bhopal", "india-planner"),
    ],
)
def test_observed_display_setting_remains_effective(
    client, tokens, country, place, user
):
    headers = tokens[user]
    original = client.get(
        "/model-settings",
        params={"country": country, "outcome": "lbw"},
        headers=headers,
    )
    assert original.status_code == 200, original.text
    values = original.json()["settings"]
    assert "observed" in values["data_modes"]
    disabled = {
        **values,
        "data_modes": [mode for mode in values["data_modes"] if mode != "observed"],
    }
    try:
        saved = client.put(
            f"/model-settings/{country}/lbw", json=disabled, headers=headers
        )
        assert saved.status_code == 200, saved.text
        capabilities = client.get(
            f"/heat-outlook/{place}/capabilities", headers=headers
        ).json()
        assert "observed" not in capabilities["data_modes"]
        assert capabilities["observed"]["reason"]
        if country == "KE":
            assert (
                client.get(
                    f"/heat-outlook/{place}/observed", headers=headers
                ).status_code
                == 404
            )
        assert (
            client.get(
                f"/heat-outlook/{place}/observed/map", headers=headers
            ).status_code
            == 404
        )
        fine = (
            "geo-ke-constituency-kajiado-central"
            if country == "KE"
            else "geo-in-madhya-pradesh-district-bhopal"
        )
        assert (
            client.get(
                f"/heat-outlook/{fine}/observed/map", headers=headers
            ).status_code
            == 404
        )
        assert client.get(f"/heat-outlook/{place}", headers=headers).status_code == 200
    finally:
        restored = client.put(
            f"/model-settings/{country}/lbw", json=values, headers=headers
        )
        assert restored.status_code == 200, restored.text
    assert (
        "observed"
        in client.get(f"/heat-outlook/{place}/capabilities", headers=headers).json()[
            "data_modes"
        ]
    )
