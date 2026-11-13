"""A map read with ``?geometry=false`` carries the same values without outlines.

The dashboard keeps a frame's outlines from its first map and asks every later
month, view or setting for values only. Through the real app and middleware,
the values-only answer must match the full one area for area, with every
geometry left out, and the flag must not leak into the next request.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import nullcontext

import pytest
from fastapi.testclient import TestClient

from chart.api.app import app
from access_support import member
from chart.auth.service import require_current_user
from chart.risk import routes as risk_routes
from test_risk_map import session  # noqa: F401 - the PostGIS-shaped fixture

MAP = "/risk/geo-in-madhya-pradesh/map?outcome=lbw&month=2026-08"


@pytest.fixture
def client(session, monkeypatch) -> Iterator[TestClient]:  # noqa: F811
    monkeypatch.setattr(
        risk_routes, "get_session_factory", lambda: lambda: nullcontext(session)
    )
    monkeypatch.setattr(
        risk_routes,
        "_resolve_place_path",
        lambda _geography_id: "/india/madhya-pradesh",
    )
    app.dependency_overrides[require_current_user] = lambda: member(
        "planner", "planning_lead", ["/india"]
    )
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(require_current_user, None)


def test_values_only_matches_the_full_map_without_outlines(client) -> None:
    full = client.get(MAP)
    lean = client.get(f"{MAP}&geometry=false")
    assert full.status_code == lean.status_code == 200
    full_body, lean_body = full.json(), lean.json()

    assert all(area["geometry"] for area in full_body["areas"])
    assert all(area["geometry"] is None for area in lean_body["areas"])
    without_outline = [
        {key: value for key, value in area.items() if key != "geometry"}
        for area in full_body["areas"]
    ]
    assert [
        {key: value for key, value in area.items() if key != "geometry"}
        for area in lean_body["areas"]
    ] == without_outline
    # The framing a client needs to place the kept outlines is still there.
    assert lean_body["bounds"] == full_body["bounds"]
    assert len(lean.content) < len(full.content)

    # Bhopal computed, Rewa covered but not run, Indore unmodelled.
    by_code = {area["code"]: area for area in lean_body["areas"]}
    assert by_code["bhopal"]["value_percent"] == pytest.approx(13.0)
    assert by_code["rewa"]["missing_reason"] == "no_prediction"
    assert by_code["indore"]["missing_reason"] == "no_model"


def test_the_flag_does_not_outlive_its_request(client) -> None:
    assert client.get(f"{MAP}&geometry=false").json()["areas"][0]["geometry"] is None
    assert client.get(MAP).json()["areas"][0]["geometry"] is not None
    # Anything but an explicit false keeps the outlines.
    assert client.get(f"{MAP}&geometry=true").json()["areas"][0]["geometry"] is not None


def test_the_flag_reaches_reads_beyond_map_paths(client) -> None:
    """Climate layers and population build their areas the same way; their
    paths do not end in /map, so the flag is honoured on every path."""
    from chart.risk.service import map_geometry_wanted

    path = "/_probe/population"
    app.add_api_route(path, lambda: {"geometry": map_geometry_wanted.get()})
    try:
        assert client.get(f"{path}?geometry=false").json() == {"geometry": False}
        assert client.get(path).json() == {"geometry": True}
    finally:
        app.router.routes[:] = [
            route for route in app.router.routes if getattr(route, "path", None) != path
        ]
