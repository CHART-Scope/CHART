"""The six-month forecast: issue dates, area anomalies and the served reads.

The build itself downloads from Copernicus; here its parts are checked on
synthetic data: which issue and months a date gets, that a place's anomaly is
weighted by the share of each forecast cell it covers, and that a saved
issue is served publicly, place by place and as a map, ranges included.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from datetime import date

import numpy as np
import pytest
import xarray as xr
from fastapi.testclient import TestClient
from shapely.geometry import box
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from chart.api.app import app
from chart.climate import seasonal_forecast
from chart.heat_outlook import forecast as forecast_module
from chart.heat_outlook import routes as outlook_routes
from chart.risk import routes as risk_routes
from chart.risk.schemas import MapArea, MapResponse
from chart.shared.db.base import Base
from chart.shared.db.models import AppGeography, CountryGeoConfig

KAJIADO = "geo-ke-kajiado"


def test_issue_and_target_months() -> None:
    # C3S publishes on the 10th; the 11th is the first day an issue is used.
    assert seasonal_forecast.latest_issue(date(2026, 10, 10)) == date(2026, 9, 1)
    assert seasonal_forecast.latest_issue(date(2026, 10, 11)) == date(2026, 10, 1)
    assert seasonal_forecast.latest_issue(date(2026, 1, 3)) == date(2025, 12, 1)
    assert seasonal_forecast.target_months(date(2026, 10, 1)) == [
        date(2026, 10, 1),
        date(2026, 11, 1),
        date(2026, 12, 1),
        date(2027, 1, 1),
        date(2027, 2, 1),
        date(2027, 3, 1),
    ]


def test_a_places_anomaly_weights_the_cells_it_covers(tmp_path) -> None:
    """Two 1 deg cells at +1 and +3 deg C; a place covering a quarter of the
    first and three quarters of the second gets 2.5."""
    data = np.zeros((6, 1, 2))
    data[:, 0, 0] = 1.0
    data[:, 0, 1] = 3.0
    path = tmp_path / "anomaly.nc"
    xr.Dataset(
        {"mx2t24a": (("forecastMonth", "latitude", "longitude"), data)},
        coords={
            "forecastMonth": [1, 2, 3, 4, 5, 6],
            "latitude": [0.0],
            "longitude": [36.0, 37.0],
        },
    ).to_netcdf(path)
    place = box(36.25, -0.5, 37.25, 0.5)
    found = seasonal_forecast.area_anomalies(path, {"p": place})
    assert set(found["p"]) == {1, 2, 3, 4, 5, 6}
    assert found["p"][1] == pytest.approx(2.5, abs=0.01)
    # A place outside the grid gets nothing, never zero.
    far = seasonal_forecast.area_anomalies(path, {"far": box(80, 20, 81, 21)})
    assert "far" not in far


@pytest.fixture
def client(tmp_path, monkeypatch) -> Iterator[TestClient]:
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    with factory() as session:
        for level, label in (("country", "Country"), ("county", "County")):
            session.add(
                CountryGeoConfig(country_code="KE", level_key=level, level_label=label)
            )
        session.flush()
        for geography_id, parent in (("geo-ke", None), (KAJIADO, "geo-ke")):
            session.add(
                AppGeography(
                    id=geography_id,
                    country_code="KE",
                    level="county" if parent else "country",
                    level_label="County" if parent else "Country",
                    name="Kajiado" if parent else "Kenya",
                    parent_id=parent,
                    path="/kenya/kajiado" if parent else "/kenya",
                )
            )
            session.flush()
        session.commit()
    monkeypatch.setenv("MODEL_CACHE_DIR", str(tmp_path))
    monkeypatch.setenv("CHART_PUBLIC_READ", "true")
    (tmp_path / "forecasts").mkdir()
    (tmp_path / "forecasts" / "KE-2026-10.json").write_text(
        json.dumps(
            {
                "country": "KE",
                "issue": "2026-10",
                "months": ["2026-10", "2026-11"],
                "systems": ["ecmwf 51", "ukmo 610"],
                "source": "Copernicus C3S multi-system seasonal forecast",
                "source_uri": "https://cds.climate.copernicus.eu/datasets/x",
                "method": "normal plus anomaly",
                "places": {
                    KAJIADO: {
                        "tmax_c": {
                            "2026-10": [29.1, 28.6, 29.8],
                            "2026-11": [28.0, 27.5, 28.4],
                        },
                        "lbw": {
                            "selector": "P",
                            "values": {
                                "P": {
                                    "2026-10": [14.2, 11.0, 17.5],
                                    "2026-11": [12.0, 9.5, 14.1],
                                }
                            },
                        },
                    }
                },
            }
        )
    )
    monkeypatch.setattr(outlook_routes, "get_session_factory", lambda: factory)
    monkeypatch.setattr(
        risk_routes,
        "_resolve_place_path",
        lambda geography_id: "/kenya/kajiado" if geography_id == KAJIADO else "/kenya",
    )

    def frame(_session, geography_id, month, **_kwargs) -> MapResponse:
        return MapResponse(
            geography_id=geography_id,
            outcome="lbw",
            areas=[
                MapArea(
                    admin_unit_id=1,
                    geography_id=KAJIADO,
                    code="kajiado",
                    level="county",
                    name="Kajiado",
                )
            ],
        )

    monkeypatch.setattr(forecast_module, "load_map_view", frame)
    app.dependency_overrides.clear()
    yield TestClient(app)


def test_a_saved_issue_is_served_publicly_with_ranges(client) -> None:
    body = client.get(f"/heat-outlook/{KAJIADO}/forecast?outcome=lbw").json()
    assert body["issue"] == "2026-10"
    assert body["selector"] == "P"
    assert body["systems"] == ["ecmwf 51", "ukmo 610"]
    october = body["months"][0]
    assert (
        october["value_percent"],
        october["low_percent"],
        october["high_percent"],
    ) == (14.2, 11.0, 17.5)
    assert october["tmax_c"] == 29.1

    mapped = client.get("/heat-outlook/geo-ke/forecast/map?outcome=lbw&month=2026-11")
    assert mapped.status_code == 200, mapped.text
    data = mapped.json()
    assert data["months"] == ["2026-10", "2026-11"]
    (area,) = data["areas"]
    assert area["value_percent"] == 12.0
    assert data["ranges"][KAJIADO] == [9.5, 14.1]

    # An outcome the place was not scored for shows as such, not as zero.
    u5 = client.get("/heat-outlook/geo-ke/forecast/map?outcome=under_5_mortality")
    assert u5.json()["areas"][0]["value_percent"] is None
    # A month outside the issue is refused.
    outside = client.get("/heat-outlook/geo-ke/forecast/map?outcome=lbw&month=2027-06")
    assert outside.status_code == 422


def test_a_place_without_its_own_model_takes_the_mean_of_its_places() -> None:
    """Regression: Kenya as a whole has no calibrated curve, so its six months
    were saved empty while all 47 counties had estimates."""
    from chart.climate.seasonal_scoring import _fill_from_children

    def scored(central: float) -> dict:
        return {
            "selector": "P",
            "values": {"P": {"2026-10": [central, central - 1, central + 1]}},
        }

    places = {
        "geo-ke": {"tmax_c": {}},
        "geo-ke-a": {"tmax_c": {}, "lbw": scored(10.0)},
        "geo-ke-b": {"tmax_c": {}, "lbw": scored(20.0)},
        "geo-ke-b-x": {"tmax_c": {}, "lbw": scored(99.0)},
    }
    parents = {
        "geo-ke": None,
        "geo-ke-a": "geo-ke",
        "geo-ke-b": "geo-ke",
        "geo-ke-b-x": "geo-ke-b",
    }

    assert _fill_from_children(places, parents) == 1
    # Direct places only: the constituency does not count twice.
    assert places["geo-ke"]["lbw"]["values"]["P"]["2026-10"] == [15.0, 14.0, 16.0]
    assert places["geo-ke"]["lbw"]["from_children"] == 2
    assert "under_5_mortality" not in places["geo-ke"]
