"""Reading a place above one's grants shows its figures, not the areas beside.

Members read the places above their grants for context (docs/access-control.md),
so a Bhopal officer opens Madhya Pradesh. Regression: the map then returned
every division under the state, and an ``admin_unit`` picked beneath the
state read the division next door. Through the real app; only the signed-in
person is stood in for.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import nullcontext

import pytest
from fastapi.testclient import TestClient

from access_support import member
from chart.api.app import app
from chart.auth.service import require_current_user
from chart.risk import routes as risk_routes
from test_risk_map import session  # noqa: F401 - the PostGIS-shaped fixture

STATE = "geo-in-madhya-pradesh"
MAP = f"/risk/{STATE}/map?outcome=lbw&month=2026-08"


@pytest.fixture
def sign_in(session, monkeypatch) -> Iterator:  # noqa: F811
    monkeypatch.setattr(
        risk_routes, "get_session_factory", lambda: lambda: nullcontext(session)
    )

    def as_member(role: str, place: str) -> TestClient:
        app.dependency_overrides[require_current_user] = lambda: member(
            "person", role, [place]
        )
        return TestClient(app)

    try:
        yield as_member
    finally:
        app.dependency_overrides.pop(require_current_user, None)


def test_the_state_map_shows_a_division_officer_only_their_division(sign_in) -> None:
    officer = sign_in("viewer", "/india/madhya-pradesh/bhopal")
    response = officer.get(MAP)
    assert response.status_code == 200, response.text
    assert [area["code"] for area in response.json()["areas"]] == ["bhopal"]


def test_a_state_member_still_sees_every_division(sign_in) -> None:
    lead = sign_in("planning_lead", "/india/madhya-pradesh")
    codes = {area["code"] for area in lead.get(MAP).json()["areas"]}
    assert codes == {"bhopal", "rewa", "indore"}


@pytest.mark.parametrize("view", ["short-term", "long-term", "current-observation"])
def test_an_area_picked_beneath_the_state_must_be_readable_itself(
    sign_in, view
) -> None:
    officer = sign_in("viewer", "/india/madhya-pradesh/bhopal")
    beside = officer.get(f"/risk/{STATE}/{view}?admin_unit=geo-in-mp-rewa")
    assert beside.status_code == 403
    assert beside.json()["error"] == "GEOGRAPHY_OUT_OF_SCOPE"
    own = officer.get(f"/risk/{STATE}/{view}?admin_unit=geo-in-mp-bhopal")
    assert own.status_code != 403
