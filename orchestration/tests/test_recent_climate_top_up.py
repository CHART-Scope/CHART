"""End to end: every configured place holds its observed climate history.

The places come from the published model configuration (the outlook index),
the list the dashboard's pickers offer. A history backfill and the automatic
top-up both derive every listed place from one retained ERA5 grid per
country-year and persist it; a registered place the configuration does not
list is never pulled. The grid is a synthetic cached NetCDF fixture, so no
Copernicus request is made. Each place's heatwave days use its own official
threshold (``heat_seasons.json``).
"""

from __future__ import annotations

import json
import math
import subprocess
import threading
from calendar import monthrange
from datetime import date, datetime, timedelta, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

import dagster as dg
import numpy as np
import pandas as pd
import pytest
import xarray as xr
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from chart.climate import history
from chart.climate.ingestion_jobs import (
    TOP_UP_REQUESTER,
    queue_recent_month_top_ups,
    recent_complete_months,
)
from chart.shared.db.base import Base
from chart.heat_outlook.climate_layer import load_climate_layer
from chart.risk.schemas import MapArea, MapResponse
from chart.shared.db.models import (
    AdminUnit,
    AppGeography,
    ClimateIngestionJob,
    DistrictClimate,
    DistrictClimateDay,
    Geography,
)
from chart_pipeline.definitions import (
    climate_ingestion_job,
    pending_climate_ingestions_sensor,
    recent_climate_months_sensor,
)
from era5_heat.cds_client import cache_key

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / "outputs/e2e/orchestration/recent-climate-top-up"
#: Every hour at 33 deg C: above Nairobi's 32 deg C threshold, below the
#: 35 deg C CHART default and Mombasa's 36 deg C.
TMAX_K = 306.15
#: (slug, west, north, east, south, in the model configuration)
PLACES = (
    ("nairobi", 36.0, -1.0, 36.5, -1.5, True),
    ("kajiado", 36.5, -1.0, 37.0, -1.5, True),
    # Smaller than one 0.25 deg cell and holding no cell centre.
    ("mombasa", 36.3, -1.3, 36.4, -1.4, True),
    # Registered with a boundary but not offered by the configuration.
    ("unlisted", 36.6, -1.1, 36.9, -1.4, False),
)
#: The countries' snapped download box: one cell beyond the configured places.
ACQUISITION = (-0.75, 35.75, -1.75, 37.25)


def _polygon(west: float, north: float, east: float, south: float) -> str:
    ring = [[west, north], [east, north], [east, south], [west, south], [west, north]]
    return json.dumps({"type": "MultiPolygon", "coordinates": [[ring]]})


@pytest.fixture
def session_factory(tmp_path, monkeypatch):
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    # As the application's factory: rows stay readable after commit.
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    monkeypatch.setenv("ERA5_CACHE_DIR", str(tmp_path / "cache"))
    monkeypatch.setenv("CLIMATE_OUTPUT_DIR", str(tmp_path / "outputs"))
    monkeypatch.setenv("MODEL_CACHE_DIR", str(tmp_path / "models"))
    # A cache miss must fail loudly rather than reach Copernicus.
    monkeypatch.setenv("CDSAPI_URL", "http://127.0.0.1:1/no-network-expected")
    monkeypatch.setenv("CDSAPI_KEY", "disposable-top-up-test")
    monkeypatch.setenv("ERA5_MIRROR_URL", "")
    index = tmp_path / "models/outlooks/index.json"
    index.parent.mkdir(parents=True)
    index.write_text(
        json.dumps(
            {
                f"geo-ke-{slug}": {"country_code": "KE", "level": "county"}
                for slug, *_, listed in PLACES
                if listed
            }
        )
    )
    with factory() as session:
        geography = Geography(slug="kenya", country="Kenya", name="Kenya")
        session.add(geography)
        session.flush()
        for slug, west, north, east, south, _ in PLACES:
            session.add(
                AppGeography(
                    id=f"geo-ke-{slug}",
                    country_code="KE",
                    level="county",
                    level_label="County",
                    name=slug.title(),
                    path=f"/kenya/{slug}",
                )
            )
            session.flush()
            session.add(
                AdminUnit(
                    geography_id=geography.id,
                    app_geography_id=f"geo-ke-{slug}",
                    level="county",
                    code=slug,
                    name=slug.title(),
                    boundary=_polygon(west, north, east, south),
                    bbox_north=north,
                    bbox_west=west,
                    bbox_south=south,
                    bbox_east=east,
                )
            )
        session.commit()
    with patch("chart_pipeline.definitions.get_session_factory", return_value=factory):
        yield factory


def _cache_grid(
    cache: Path,
    months: list[date],
    *,
    acquisition: tuple[float, float, float, float] = ACQUISITION,
    step: float = 0.25,
    dataset_name: str = "reanalysis-era5-single-levels",
    tmax_k: float = TMAX_K,
) -> None:
    """The retained hourly grid a country pull of ``months`` reads."""
    cache.mkdir(parents=True, exist_ok=True)
    north, west, south, east = acquisition
    # ERA5 is requested a year at a time, ERA5-Land a month at a time.
    requests: list[tuple[int, tuple[int, ...]]] = []
    for year in sorted({month.year for month in months}):
        held = tuple(month.month for month in months if month.year == year)
        if dataset_name == "reanalysis-era5-land":
            requests.extend((year, (number,)) for number in held)
        else:
            requests.append((year, held))
    for year, chosen in requests:
        hours = pd.DatetimeIndex(
            [
                datetime(year, month, 1) + timedelta(hours=hour)
                for month in chosen
                for hour in range(monthrange(year, month)[1] * 24)
            ]
        )
        lats = np.round(np.arange(north, south - step / 4, -step), 4)
        lons = np.round(np.arange(west, east + step / 4, step), 4)
        dataset = xr.Dataset(
            {
                "t2m": (
                    ("valid_time", "latitude", "longitude"),
                    np.full((len(hours), len(lats), len(lons)), tmax_k),
                )
            },
            coords={"valid_time": hours, "latitude": lats, "longitude": lons},
        )
        dataset.t2m.attrs["units"] = "K"
        key = cache_key(year, acquisition, chosen, dataset_name)
        dataset.to_netcdf(cache / f"{key}.nc")
        dataset.close()


def _held(factory) -> dict[tuple[str, date], dict[str, float]]:
    with factory() as session:
        rows = session.execute(
            select(
                AdminUnit.code,
                DistrictClimate.period_month,
                DistrictClimate.variable,
                DistrictClimate.value,
            ).join(AdminUnit, AdminUnit.id == DistrictClimate.admin_unit_id)
        ).all()
    out: dict = {}
    for code, month, variable, value in rows:
        out.setdefault((code, month), {})[variable] = value
    return out


def _evidence(name: str, record: dict) -> None:
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    record["revision"] = subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
    ).strip()
    record["working_tree"] = subprocess.check_output(
        ["git", "status", "--short"], cwd=ROOT, text=True
    )
    (EVIDENCE / f"{name}.json").write_text(
        json.dumps(record, indent=2, default=str) + "\n"
    )


def test_missing_recent_months_are_pulled_with_each_places_threshold(
    session_factory, tmp_path
):
    months = recent_complete_months(date.today(), count=2)
    _cache_grid(tmp_path / "cache", months)
    instance = dg.DagsterInstance.ephemeral()

    queued = list(
        recent_climate_months_sensor(dg.build_sensor_context(instance=instance))
    )
    assert len(queued) == 1 and isinstance(queued[0], dg.SkipReason)
    with session_factory() as session:
        (job,) = session.scalars(select(ClimateIngestionJob)).all()
        assert (job.country_code, job.requested_by_user_id) == ("KE", TOP_UP_REQUESTER)
        assert job.months == [month.strftime("%Y-%m") for month in months]
        # Only the configured places count towards the pull.
        assert job.areas_total == 3

    (request,) = pending_climate_ingestions_sensor(
        dg.build_sensor_context(instance=instance)
    )
    result = climate_ingestion_job.execute_in_process(
        run_config=request.run_config, tags=request.tags, instance=instance
    )
    assert result.success

    held = _held(session_factory)
    record = {
        "test": "missing_recent_months_are_pulled_with_each_places_threshold",
        "fixture": "Synthetic cached ERA5 grid, 33 C every hour, four Kenyan places",
        "months": months,
        "held": {f"{code} {month}": values for (code, month), values in held.items()},
    }
    _evidence("pull", record)
    for month in months:
        days = monthrange(month.year, month.month)[1]
        # Nairobi's official threshold is 32 deg C: every day is a heatwave day.
        assert held[("nairobi", month)]["heatwave_days"] == days
        # Kajiado has no official threshold, so CHART's 35 deg C applies.
        assert held[("kajiado", month)]["heatwave_days"] == 0
        # Mombasa holds no cell centre; its overlapping cells are used instead.
        assert held[("mombasa", month)]["tmax_monthly_mean_c"] == pytest.approx(33.0)
    assert not any(code == "unlisted" for code, _ in held)

    with session_factory() as session:
        job = session.scalars(select(ClimateIngestionJob)).one()
        assert (job.status, job.areas_done) == ("completed", 3)

    # Once held, the next evaluation queues nothing.
    again = list(
        recent_climate_months_sensor(dg.build_sensor_context(instance=instance))
    )
    assert again[0].skip_message == "Recent climate months are already held."
    with session_factory() as session:
        assert len(session.scalars(select(ClimateIngestionJob)).all()) == 1
    record["result"] = "passed"
    _evidence("pull", record)


def test_backfill_fills_every_configured_place_once(session_factory, tmp_path):
    months = history.history_months(1, date.today())
    _cache_grid(tmp_path / "cache", months)
    logs: list[str] = []

    report = history.backfill("KE", 1, session_factory=session_factory, log=logs.append)

    assert report.coverage is not None and report.coverage.complete
    assert report.coverage.places == 3
    assert report.pulled_years == sorted({month.year for month in months})
    held = _held(session_factory)
    assert {code for code, _ in held} == {"nairobi", "kajiado", "mombasa"}
    assert len(held) == 3 * len(months)
    rows = len(held)

    # A second run finds nothing missing and downloads nothing.
    repeat = history.backfill("KE", 1, session_factory=session_factory, log=logs.append)
    assert repeat.pulled_years == [] and repeat.coverage.complete
    assert len(_held(session_factory)) == rows
    _evidence(
        "backfill",
        {
            "test": "backfill_fills_every_configured_place_once",
            "months": [months[0], months[-1]],
            "places": report.coverage.places,
            "place_months": rows,
            "log": logs,
            "result": "passed",
        },
    )


def test_backfill_reads_the_public_mirror_before_copernicus(
    session_factory, tmp_path, monkeypatch
):
    """A new installation fetches retained grids from the mirror, not the queue."""
    months = history.history_months(1, date.today())
    mirror = tmp_path / "mirror"
    _cache_grid(mirror, months)
    for grid in mirror.glob("*.nc"):
        grid.with_suffix(".json").write_text(json.dumps({"request": "fixture"}))
    handler = partial(SimpleHTTPRequestHandler, directory=str(mirror))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        monkeypatch.setenv(
            "ERA5_MIRROR_URL", f"http://127.0.0.1:{server.server_address[1]}"
        )
        report = history.backfill("KE", 1, session_factory=session_factory, log=print)
    finally:
        server.shutdown()
    assert report.coverage is not None and report.coverage.complete
    # The grids now sit in the local cache, so later pulls need no network.
    assert sorted(path.name for path in (tmp_path / "cache").glob("*.nc")) == sorted(
        path.name for path in mirror.glob("*.nc")
    )
    _evidence(
        "mirror",
        {
            "test": "backfill_reads_the_public_mirror_before_copernicus",
            "grids": sorted(path.name for path in mirror.glob("*.nc")),
            "places": report.coverage.places,
            "result": "passed",
        },
    )


def test_era5_land_fills_its_own_layer_and_never_the_model_input(
    session_factory, tmp_path, monkeypatch
):
    """ERA5-Land is a map layer: stored apart, invisible to scoring."""
    months = history.history_months(1, date.today())
    # 30 deg C on the 0.1 deg ERA5-Land grid, one cell beyond the places.
    _cache_grid(
        tmp_path / "cache",
        months,
        acquisition=(-0.9, 35.9, -1.6, 37.1),
        step=0.1,
        dataset_name="reanalysis-era5-land",
        tmax_k=303.15,
    )
    report = history.backfill(
        "KE", 1, session_factory=session_factory, log=print, product="era5-land"
    )
    assert report.coverage is not None and report.coverage.complete
    assert report.scored == 0 and not report.unscored

    with session_factory() as session:
        variables = set(session.scalars(select(DistrictClimate.variable).distinct()))
        daily = session.scalar(select(func.count(DistrictClimateDay.id)))
        # The models' ERA5 input is still missing every month.
        era5 = history.coverage(session, "KE", months)
        queued = queue_recent_month_top_ups(session, today=date.today())
        session.rollback()
    assert variables == {
        "land_tmax_monthly_mean_c",
        "land_tmax_monthly_max_c",
        "land_heatwave_days",
    }
    assert daily == 0
    assert len(era5.missing) == 3
    assert [job.country_code for job in queued] == ["KE"]

    def frame(session, geography_id, month, **_kwargs):
        units = session.scalars(select(AdminUnit).order_by(AdminUnit.code)).all()
        return MapResponse(
            geography_id=geography_id,
            outcome="lbw",
            areas=[
                MapArea(
                    admin_unit_id=unit.id,
                    geography_id=unit.app_geography_id,
                    code=unit.code,
                    name=unit.name,
                    level=unit.level,
                )
                for unit in units
            ],
        )

    monkeypatch.setattr("chart.heat_outlook.climate_layer.load_map_view", frame)
    with session_factory() as session:
        layer = load_climate_layer(session, "geo-ke", "tmax", None)
        days = load_climate_layer(session, "geo-ke", "heat_days", None)
    values = {area.code: area.value_percent for area in layer.areas}
    assert layer.month == months[-1].strftime("%Y-%m")
    assert len(layer.available_months) == len(months)
    assert values["nairobi"] == values["mombasa"] == pytest.approx(30.0)
    # Not in the model configuration, so never pulled.
    assert values["unlisted"] is None
    # 30 deg C sits below every threshold here (Nairobi 32, default 35).
    assert {area.value_percent for area in days.areas if area.code != "unlisted"} == {0}
    _evidence(
        "era5-land",
        {
            "test": "era5_land_fills_its_own_layer_and_never_the_model_input",
            "variables": sorted(variables),
            "daily_rows": daily,
            "era5_places_missing": len(era5.missing),
            "layer_month": layer.month,
            "result": "passed",
        },
    )


def test_history_starts_in_january_years_back() -> None:
    months = history.history_months(2, date(2026, 10, 30))
    assert (months[0], months[-1]) == (date(2024, 1, 1), date(2026, 9, 1))
    assert len(months) == 33 and math.isclose(len(months) / 12, 2.75)


def test_recent_top_up_waits_before_repeating(session_factory):
    months = recent_complete_months(date.today(), count=2)
    now = datetime.now(timezone.utc)
    with session_factory() as session:
        session.add(
            ClimateIngestionJob(
                country_code="KE",
                months=[month.strftime("%Y-%m") for month in months],
                status="completed",
                stage="completed",
                requested_by_user_id=TOP_UP_REQUESTER,
                completed_at=now - timedelta(hours=2),
            )
        )
        session.commit()

        # The months are still missing, but the last automatic pull was recent.
        assert queue_recent_month_top_ups(session, today=now.date(), now=now) == []
        later = now + timedelta(hours=23)
        retried = queue_recent_month_top_ups(session, today=later.date(), now=later)
        session.commit()
        assert [job.country_code for job in retried] == ["KE"]
    _evidence(
        "retry",
        {
            "test": "recent_top_up_waits_before_repeating",
            "last_pull_at": now - timedelta(hours=2),
            "retried_at": later,
            "result": "passed",
        },
    )
