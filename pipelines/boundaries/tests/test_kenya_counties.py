from __future__ import annotations

import csv
import json
from pathlib import Path

from shapely.geometry import shape


ROOT = Path(__file__).resolve().parents[2]
CROSSWALK = ROOT / "boundaries/data/kenya_county_climate_zone_crosswalk.csv"
BOUNDARIES = ROOT / "boundaries/data/kenya_counties_climate_zones.geojson"
RELEASE = ROOT / "models/lbw/model-release.kenya.review.json"

FITTED_ZONES = {
    "Central Highlands",
    "Coastal Strip",
    "Lake Victoria Basin & Western Highlands",
    "North-eastern",
    "South-eastern",
}


def test_kenya_crosswalk_declares_all_counties_and_only_turkana_is_unsupported():
    with CROSSWALK.open(newline="", encoding="utf-8") as source:
        rows = list(csv.DictReader(source))

    assert len(rows) == 47
    assert len({row["place_code"] for row in rows}) == 47
    assert {
        row["climate_zone"] for row in rows if row["model_supported"] == "true"
    } == FITTED_ZONES
    assert [
        (row["place_code"], row["climate_zone"])
        for row in rows
        if row["model_supported"] == "false"
    ] == [("turkana", "North-western")]


def test_kenya_county_boundaries_match_crosswalk_and_are_valid():
    document = json.loads(BOUNDARIES.read_text(encoding="utf-8"))
    features = document["features"]
    with CROSSWALK.open(newline="", encoding="utf-8") as source:
        rows = list(csv.DictReader(source))

    assert len(features) == 47
    assert {item["properties"]["admin_unit_code"] for item in features} == {
        row["place_code"] for row in rows
    }
    assert all(item["properties"]["geography_level"] == "county" for item in features)
    assert all(shape(item["geometry"]).is_valid for item in features)


def test_kenya_release_separates_navigation_counties_from_model_mappings():
    release = json.loads(RELEASE.read_text(encoding="utf-8"))
    places = release["geography"]["places"]
    mappings = release["areas"]

    assert len(places) == 47
    assert len(mappings) == 46
    assert {item["model_area_name"] for item in mappings} == FITTED_ZONES
    assert {item["place_code"] for item in places} - {
        item["place_code"] for item in mappings
    } == {"turkana"}
    assert (
        next(item for item in mappings if item["place_code"] == "kajiado")[
            "model_area_name"
        ]
        == "South-eastern"
    )
