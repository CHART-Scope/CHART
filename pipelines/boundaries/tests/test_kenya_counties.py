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
    """All 47 counties are navigable; only 46 of them have a fitted zone.

    The release used to carry its own `geography.places` list beside an
    `areas` mapping. Places now live in a shared place set and the release
    declares only its `model_areas`, each naming the counties it covers - so
    the gap is read by subtracting the members from the crosswalk rather than
    by comparing two lists inside one file.

    Turkana is that gap: the North-western zone has no fitted LBW block, so
    the county is navigable and unmodelled rather than quietly absent.
    """
    release = json.loads(RELEASE.read_text(encoding="utf-8"))
    model_areas = release["model_areas"]
    with CROSSWALK.open(newline="", encoding="utf-8") as source:
        counties = {row["place_code"] for row in csv.DictReader(source)}

    assert {area["name"] for area in model_areas} == FITTED_ZONES
    covered = [code for area in model_areas for code in area["members"]]
    # No county may be claimed by two zones: the mapping is a partition.
    assert len(covered) == len(set(covered))
    assert set(covered) <= counties
    assert counties - set(covered) == {"turkana"}
    assert len(covered) == 46

    # The release points at the shared place set rather than restating it.
    assert release["place_set"]["id"] == "ke-counties"

    kajiado = next(area for area in model_areas if "kajiado" in area["members"])
    assert kajiado["name"] == "South-eastern"
