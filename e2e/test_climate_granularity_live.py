"""Country pulls derive new fine areas from retained grids through real services."""

from datetime import date
import hashlib
import json
import os
from pathlib import Path

import dagster as dg
from geoalchemy2.shape import from_shape
import numpy as np
import pandas as pd
from shapely.geometry import MultiPolygon, box
from sqlalchemy import delete, func, select
import xarray as xr

from chart.climate.input_windows import select_input_months
from chart.shared.db.models import (
    AdminUnit,
    AppGeography,
    ClimateIngestionJob,
    ClimateRun,
    CountryGeoConfig,
    DataSource,
    DistrictClimate,
    DistrictClimateDay,
    Geography,
    Provenance,
)
from chart_pipeline.definitions import climate_ingestion_job
from era5_heat import CELL_CENTRE, CELL_OVERLAP
from era5_heat.cds_client import DATASET, build_request, cache_key

# Reuse the same actual sensor invocation as the interruption regressions.
from test_climate_recovery_live import dispatch


def add_area(session, geography_id, *, child=False):
    identifier = "geo-e2e-child" if child else "geo-e2e-parent"
    bounds = (35.35, 0.35, 35.45, 0.45) if child else (35.0, 0.0, 36.0, 1.0)
    west, south, east, north = bounds
    place = AppGeography(
        id=identifier,
        country_code="ZZ",
        level="district" if child else "county",
        level_label="District" if child else "County",
        name="Disposable child" if child else "Disposable parent",
        parent_id="geo-e2e-parent" if child else None,
        path="/e2e/parent/child" if child else "/e2e/parent",
    )
    session.add(place)
    session.flush()
    area = AdminUnit(
        geography_id=geography_id,
        app_geography_id=identifier,
        code=identifier,
        level=place.level,
        name=place.name,
        bbox_north=north,
        bbox_west=west,
        bbox_south=south,
        bbox_east=east,
        boundary=from_shape(MultiPolygon([box(*bounds)]), srid=4326),
        boundary_version="disposable-synthetic-boundary-v1",
    )
    session.add(area)
    session.flush()
    return area.id


def test_country_pull_reuses_acquisition_for_new_fine_area(
    client, admin_headers, jobs, tmp_path
):
    factory, _queue = jobs
    cache = tmp_path / "retained-cache"
    cache.mkdir()
    output = tmp_path / "derived-output"
    # One larger raw acquisition contains both the requested country extent and
    # a second month. Outer cells deliberately differ from the country values.
    bbox = (2.0, 34.0, -1.0, 37.0)
    times = pd.date_range("2025-01-01", "2025-03-01", inclusive="left", freq="h")
    values = np.full((len(times), 4, 4), 320.15)
    values[:, 1:3, 1:3] = 300.15
    dataset = xr.Dataset(
        {"t2m": (("valid_time", "latitude", "longitude"), values)},
        coords={
            "valid_time": times,
            "latitude": [2.0, 1.0, 0.0, -1.0],
            "longitude": [34.0, 35.0, 36.0, 37.0],
        },
    )
    dataset.t2m.attrs["units"] = "K"
    raw = cache / f"{cache_key(2025, bbox, (1, 2))}.nc"
    dataset.to_netcdf(raw, engine="netcdf4")
    dataset.close()
    raw.with_suffix(".json").write_text(
        json.dumps(
            {
                "dataset": DATASET,
                "request": build_request(2025, bbox, (1, 2)),
                "downloaded_at": "2025-03-08T00:00:00+00:00",
            }
        )
    )
    raw_sha = hashlib.sha256(raw.read_bytes()).hexdigest()
    environment = {
        "ERA5_CACHE_DIR": str(cache),
        "CLIMATE_OUTPUT_DIR": str(output),
        # A cache miss must fail locally, never use personal CDS credentials.
        "CDSAPI_URL": "http://127.0.0.1:1/no-network-expected",
        "CDSAPI_KEY": "disposable-cache-test",
    }
    previous = {key: os.environ.get(key) for key in environment}
    evidence = {
        "fixture": "Synthetic ZZ parent and small child, hourly Jan-Feb 2025",
        "runs": [],
        "result": "running",
    }
    geography_id = None
    try:
        os.environ.update(environment)
        with factory() as session, session.begin():
            assert not session.scalar(
                select(AppGeography.id).where(AppGeography.country_code == "ZZ")
            )
            session.add_all(
                [
                    CountryGeoConfig(
                        country_code="ZZ", level_key=level, level_label=level.title()
                    )
                    for level in ("county", "district")
                ]
            )
            geography = Geography(
                slug="e2e-cached-granularity",
                country="ZZ",
                name="Disposable cache fixture",
            )
            session.add(geography)
            session.flush()
            geography_id = geography.id
            parent_id = add_area(session, geography_id)

        def pull(instance, expected_areas, expected_done=None):
            response = client.post(
                "/climate/ingestion-jobs",
                json={"country_code": "ZZ", "months": ["2025-01"]},
                headers=admin_headers,
            )
            assert response.status_code == 202, response.text
            queued = response.json()
            assert queued["status"] == "queued"
            assert queued["areas_total"] == expected_areas
            request = next(
                item
                for item in dispatch(instance)
                if isinstance(item, dg.RunRequest)
                and item.tags["climate_ingestion_job_id"] == str(queued["id"])
            )
            result = climate_ingestion_job.execute_in_process(
                instance=instance,
                run_config=request.run_config,
                tags=request.tags,
            )
            assert result.success
            response = client.get(
                "/climate/ingestion-jobs",
                params={"country_code": "ZZ"},
                headers=admin_headers,
            )
            assert response.status_code == 200, response.text
            job = next(item for item in response.json() if item["id"] == queued["id"])
            assert (job["status"], job["stage"], job["areas_done"]) == (
                "completed",
                "completed",
                expected_areas if expected_done is None else expected_done,
            )
            with factory() as session:
                saved = session.get(ClimateIngestionJob, queued["id"])
                run = session.get(ClimateRun, saved.climate_run_id)
                assert saved.dagster_run_id == result.run_id
                assert run.raw_object_uri == str(raw)
                assert run.downscaling_method == "none"
                record = {
                    "job_id": saved.id,
                    "run_id": run.id,
                    "raw_object_hash": run.raw_object_hash,
                    "boundary_version": run.boundary_version,
                }
                evidence["runs"].append(record)
                return record

        def persisted_values(run_id):
            with factory() as session:
                return {
                    row.admin_unit_id: (
                        row.value,
                        row.agg_method,
                        row.observed_days,
                        row.expected_days,
                    )
                    for row in session.scalars(
                        select(DistrictClimate).where(
                            DistrictClimate.climate_run_id == run_id,
                            DistrictClimate.variable == "tmax_monthly_mean_c",
                        )
                    )
                }

        dagster_home = tmp_path / "dagster"
        dagster_home.mkdir()
        with dg.DagsterInstance.local_temp(str(dagster_home)) as instance:
            first = pull(instance, 1)
            first_values = persisted_values(first["run_id"])
            assert first_values[parent_id][1:] == (CELL_CENTRE, 31, 31)
            np.testing.assert_allclose(first_values[parent_id][0], 27.0)
            with factory() as session, session.begin():
                child_id = add_area(session, geography_id, child=True)
            second = pull(instance, 2)
            assert second["run_id"] == first["run_id"]
            assert second["raw_object_hash"] == first["raw_object_hash"]
            with factory() as session:
                child_run_id = session.scalars(
                    select(DistrictClimate.climate_run_id)
                    .where(DistrictClimate.admin_unit_id == child_id)
                    .distinct()
                ).one()
                child_run = session.get(ClimateRun, child_run_id)
                assert child_run_id != first["run_id"]
                assert child_run.raw_object_hash == first["raw_object_hash"]
                assert child_run.raw_object_uri == str(raw)
                assert child_run.aggregation_version == CELL_OVERLAP
                assert child_run.boundary_version == "disposable-synthetic-boundary-v1"
                evidence["child_run_id"] = child_run_id
            values = persisted_values(child_run_id)
            # The tiny child contains no grid centre. Cell overlap still derives
            # its known 27 C value without changing its parent's calibrated method.
            assert set(values) == {child_id}
            assert values[child_id][1:] == (CELL_OVERLAP, 31, 31)
            np.testing.assert_allclose(values[child_id][0], 27.0)
            assert persisted_values(first["run_id"]) == first_values
            third = pull(instance, 2)
            assert third["run_id"] == first["run_id"]
            assert third["raw_object_hash"] == second["raw_object_hash"]
            assert persisted_values(child_run_id) == values
            with factory() as session:
                run_ids = [first["run_id"], child_run_id]
                assert (
                    session.scalar(
                        select(func.count())
                        .select_from(DistrictClimate)
                        .where(DistrictClimate.climate_run_id.in_(run_ids))
                    )
                    == 6
                )
                assert (
                    session.scalar(
                        select(func.count())
                        .select_from(DistrictClimateDay)
                        .where(DistrictClimateDay.climate_run_id.in_(run_ids))
                    )
                    == 62
                )
                assert (
                    session.scalar(
                        select(func.count())
                        .select_from(ClimateRun)
                        .where(ClimateRun.raw_object_hash == first["raw_object_hash"])
                    )
                    == 2
                )
                # Read through the actual input selector: incompatible run
                # boundary metadata would silently hide these persisted rows.
                for area_id, expected_run in (
                    (parent_id, first["run_id"]),
                    (child_id, child_run_id),
                ):
                    selected = select_input_months(
                        session,
                        admin_unit_id=area_id,
                        target_end_month=date(2025, 1, 1),
                    )[0][1]
                    assert selected is not None
                    assert selected[1].id == expected_run
                    np.testing.assert_allclose(selected[0].value, 27.0)

        coverage = client.get("/climate/coverage", headers=admin_headers)
        assert coverage.status_code == 200, coverage.text
        country = next(item for item in coverage.json() if item["country_code"] == "ZZ")
        assert (
            country["areas_total"],
            country["areas_with_data"],
            country["months"],
        ) == (2, 2, 1)
        assert all(
            area["earliest"] == area["latest"] == "2025-01-01"
            for area in country["areas"]
        )
        assert list(cache.glob("*.nc")) == [raw]
        assert hashlib.sha256(raw.read_bytes()).hexdigest() == raw_sha
        metadata_files = list(output.glob("*.json"))
        assert metadata_files
        for path in metadata_files:
            metadata = json.loads(path.read_text())
            assert metadata["cache"][0]["cache_hit"] is True
            assert metadata["cache"][0]["sha256"] == raw_sha
            assert metadata["cache"][0]["source_request"]["month"] == ["01", "02"]
            assert metadata["requested_months"] == ["2025-01-01"]
        # A request's advertised extent is not proof of the returned grid's
        # coverage. A truncated response must not renormalise a partial child.
        truncated_times = times[times < pd.Timestamp("2025-02-01")]
        truncated = xr.Dataset(
            {
                "t2m": (
                    ("valid_time", "latitude", "longitude"),
                    np.full((len(truncated_times), 2, 2), 305.15),
                )
            },
            coords={
                "valid_time": truncated_times,
                "latitude": [0.5, 0.25],
                "longitude": [35.0, 35.25],
            },
        )
        truncated.t2m.attrs["units"] = "K"
        truncated.to_netcdf(raw, engine="netcdf4")
        truncated.close()
        truncated_home = tmp_path / "truncated-dagster"
        truncated_home.mkdir()
        with dg.DagsterInstance.local_temp(str(truncated_home)) as instance:
            partial = pull(instance, 2, expected_done=1)
        assert partial["raw_object_hash"] != first["raw_object_hash"]
        assert set(persisted_values(partial["run_id"])) == {parent_id}
        np.testing.assert_allclose(
            persisted_values(partial["run_id"])[parent_id][0], 32.0
        )
        with factory() as session:
            child_runs = set(
                session.scalars(
                    select(DistrictClimate.climate_run_id).where(
                        DistrictClimate.admin_unit_id == child_id
                    )
                )
            )
            assert child_runs == {child_run_id}
        assert persisted_values(child_run_id) == values
        assert persisted_values(first["run_id"]) == first_values
        evidence["partial_coverage"] = {
            "areas_requested": 2,
            "areas_written": 1,
            "retained_child_run": child_run_id,
        }
        evidence["result"] = "passed"
    except Exception as error:
        evidence["result"] = "failed"
        evidence["error"] = type(error).__name__
        raise
    finally:
        (
            Path(os.environ["CHART_E2E_EVIDENCE"]) / "climate-granularity.json"
        ).write_text(json.dumps(evidence, indent=2) + "\n")
        for key, value in previous.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        if geography_id is not None:
            with factory() as session, session.begin():
                source_ids = select(DataSource.id).where(
                    DataSource.geography_id == geography_id
                )
                runs = list(
                    session.scalars(
                        select(ClimateRun).where(
                            ClimateRun.data_source_id.in_(source_ids)
                        )
                    )
                )
                run_ids = [run.id for run in runs]
                provenance_ids = [run.provenance_id for run in runs]
                session.execute(
                    delete(ClimateIngestionJob).where(
                        ClimateIngestionJob.country_code == "ZZ"
                    )
                )
                for model in (DistrictClimateDay, DistrictClimate):
                    session.execute(
                        delete(model).where(model.climate_run_id.in_(run_ids))
                    )
                session.execute(delete(ClimateRun).where(ClimateRun.id.in_(run_ids)))
                session.execute(
                    delete(Provenance).where(Provenance.id.in_(provenance_ids))
                )
                session.execute(
                    delete(DataSource).where(DataSource.geography_id == geography_id)
                )
                session.execute(
                    delete(AdminUnit).where(AdminUnit.geography_id == geography_id)
                )
                session.execute(
                    delete(AppGeography).where(AppGeography.country_code == "ZZ")
                )
                session.execute(
                    delete(CountryGeoConfig).where(
                        CountryGeoConfig.country_code == "ZZ"
                    )
                )
                session.execute(delete(Geography).where(Geography.id == geography_id))
