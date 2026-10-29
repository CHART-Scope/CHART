"""End to end: recent ERA5 months reach the database before anyone asks.

The top-up sensor finds the deployed areas missing a recent month and queues
one country pull; the dispatch sensor and the real Dagster job then derive
every area from a retained ERA5 grid and persist the months. The grid is a
synthetic, cached NetCDF fixture, so no Copernicus request is made. Each
area's heatwave days use its own official threshold (``heat_seasons.json``).
"""

from __future__ import annotations

import json
from calendar import monthrange
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
import subprocess
from unittest.mock import patch

import dagster as dg
import numpy as np
import pandas as pd
import pytest
import xarray as xr
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from chart.climate.ingestion_jobs import (
    TOP_UP_REQUESTER,
    queue_recent_month_top_ups,
    recent_complete_months,
)
from chart.shared.db.base import Base
from chart.shared.db.models import (
    AdminUnit,
    AppGeography,
    ClimateIngestionJob,
    ClimateRun,
    DistrictClimate,
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
#: North, west, south, east: the two counties' envelope.
ENVELOPE = (-1.0, 36.0, -1.5, 37.0)
#: Every hour at 33 deg C: above Nairobi's 32 deg C threshold, below the
#: 35 deg C CHART default other Kenyan counties use.
TMAX_K = 306.15


def _square(west: float, east: float) -> str:
    ring = [[west, -1.0], [east, -1.0], [east, -1.5], [west, -1.5], [west, -1.0]]
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
    # A cache miss must fail loudly rather than reach Copernicus.
    monkeypatch.setenv("CDSAPI_URL", "http://127.0.0.1:1/no-network-expected")
    monkeypatch.setenv("CDSAPI_KEY", "disposable-top-up-test")
    with factory() as session:
        geography = Geography(slug="kenya", country="Kenya", name="Kenya")
        session.add(geography)
        session.flush()
        for slug, name, west, east in (
            ("nairobi", "Nairobi", 36.0, 36.5),
            ("kajiado", "Kajiado", 36.5, 37.0),
        ):
            session.add(
                AppGeography(
                    id=f"geo-ke-{slug}",
                    country_code="KE",
                    level="county",
                    level_label="County",
                    name=name,
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
                    name=name,
                    boundary=_square(west, east),
                    bbox_north=-1.0,
                    bbox_west=west,
                    bbox_south=-1.5,
                    bbox_east=east,
                )
            )
        session.commit()
    with patch("chart_pipeline.definitions.get_session_factory", return_value=factory):
        yield factory


def _cache_grid(cache: Path, months: list[date]) -> None:
    """The retained hourly grid a country pull of ``months`` reads."""
    cache.mkdir(parents=True, exist_ok=True)
    for year in sorted({month.year for month in months}):
        chosen = tuple(month.month for month in months if month.year == year)
        hours = pd.DatetimeIndex(
            [
                datetime(year, month, 1) + timedelta(hours=hour)
                for month in chosen
                for hour in range(monthrange(year, month)[1] * 24)
            ]
        )
        dataset = xr.Dataset(
            {
                "t2m": (
                    ("valid_time", "latitude", "longitude"),
                    np.full((len(hours), 3, 5), TMAX_K),
                )
            },
            coords={
                "valid_time": hours,
                "latitude": [-1.0, -1.25, -1.5],
                "longitude": [36.0, 36.25, 36.5, 36.75, 37.0],
            },
        )
        dataset.t2m.attrs["units"] = "K"
        dataset.to_netcdf(cache / f"{cache_key(year, ENVELOPE, chosen)}.nc")
        dataset.close()


def _held(factory) -> dict[tuple[str, date], tuple[float, int, dict]]:
    with factory() as session:
        rows = session.execute(
            select(
                AdminUnit.code,
                DistrictClimate.period_month,
                DistrictClimate.variable,
                DistrictClimate.value,
                ClimateRun.id,
            )
            .join(AdminUnit, AdminUnit.id == DistrictClimate.admin_unit_id)
            .join(ClimateRun, ClimateRun.id == DistrictClimate.climate_run_id)
        ).all()
    out: dict = {}
    for code, month, variable, value, _run in rows:
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


def test_missing_recent_months_are_pulled_with_each_areas_threshold(
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
        assert job.country_code == "KE"
        assert job.requested_by_user_id == TOP_UP_REQUESTER
        assert job.months == [month.strftime("%Y-%m") for month in months]

    (request,) = pending_climate_ingestions_sensor(
        dg.build_sensor_context(instance=instance)
    )
    result = climate_ingestion_job.execute_in_process(
        run_config=request.run_config, tags=request.tags, instance=instance
    )
    assert result.success

    held = _held(session_factory)
    record = {
        "test": "missing_recent_months_are_pulled_with_each_areas_threshold",
        "fixture": "Synthetic cached ERA5 grid, 33 C every hour, two Kenyan counties",
        "months": months,
        "held": {f"{code} {month}": values for (code, month), values in held.items()},
    }
    _evidence("pull", record)
    for month in months:
        days = monthrange(month.year, month.month)[1]
        nairobi, kajiado = held[("nairobi", month)], held[("kajiado", month)]
        assert nairobi["tmax_monthly_mean_c"] == pytest.approx(33.0)
        # Nairobi's official threshold is 32 deg C: every day is a heatwave day.
        assert nairobi["heatwave_days"] == days
        # Kajiado has no official threshold, so CHART's 35 deg C applies.
        assert kajiado["heatwave_days"] == 0

    with session_factory() as session:
        job = session.scalars(select(ClimateIngestionJob)).one()
        assert job.status == "completed"
        thresholds = (
            sorted(
                json.loads(path.read_text())["heatwave"]["threshold_c"]
                for path in (tmp_path / "outputs").rglob("*.json")
                if "heatwave" in json.loads(path.read_text())
            )
            or None
        )

    # Once held, the next evaluation queues nothing.
    again = list(
        recent_climate_months_sensor(dg.build_sensor_context(instance=instance))
    )
    assert again[0].skip_message == "Recent climate months are already held."
    with session_factory() as session:
        assert len(session.scalars(select(ClimateIngestionJob)).all()) == 1
    record["thresholds_written"] = thresholds
    record["result"] = "passed"
    _evidence("pull", record)


def test_failed_top_up_waits_before_retrying(session_factory):
    months = recent_complete_months(date.today(), count=2)
    now = datetime.now(timezone.utc)
    with session_factory() as session:
        session.add(
            ClimateIngestionJob(
                country_code="KE",
                months=[month.strftime("%Y-%m") for month in months],
                status="failed",
                stage="failed",
                error_code="CLIMATE_INGEST_NOT_CONFIGURED",
                requested_by_user_id=TOP_UP_REQUESTER,
                completed_at=now - timedelta(hours=2),
            )
        )
        session.commit()

        assert queue_recent_month_top_ups(session, today=now.date(), now=now) == []
        # A day later the same gap is tried again.
        later = now + timedelta(hours=23)
        retried = queue_recent_month_top_ups(session, today=later.date(), now=later)
        session.commit()
        assert [job.country_code for job in retried] == ["KE"]
    _evidence(
        "retry",
        {
            "test": "failed_top_up_waits_before_retrying",
            "failed_at": now - timedelta(hours=2),
            "retried_at": later,
            "result": "passed",
        },
    )
