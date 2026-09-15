from __future__ import annotations

from datetime import date, datetime, timezone
from unittest.mock import patch

import pandas as pd
import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from chart.shared.db.base import Base
from chart.climate.input_windows import build_and_persist_input_window
from chart.climate.projection_adapter import (
    ProjectionManifest,
    ProjectionMonthValue,
    adapt_projection_months,
)
from chart.shared.db.climate_load import (
    load_era5_monthly_frame,
    load_monthly_climate_records,
)
from chart.shared.db.models import (
    AdminUnit,
    ClimateRun,
    DistrictClimate,
    Geography,
)


@pytest.fixture
def session_factory():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)


def _frame() -> pd.DataFrame:
    months = pd.date_range("2024-01-01", "2024-12-01", freq="MS")
    return pd.DataFrame(
        {
            "month": months,
            "tmax_monthly_mean_c": [30.0 + index / 10 for index in range(12)],
            "tmax_monthly_max_c": [35.0 + index / 10 for index in range(12)],
            "heatwave_days": [float(index) for index in range(12)],
            "climate_source": ["offline_fixture"] * 12,
            "climate_source_version": ["fixture-demo-v1"] * 12,
            "data_status": ["sample"] * 12,
            "generated_at": ["2026-07-21T10:00:00+00:00"] * 12,
        }
    )


def _meta() -> dict:
    return {
        "schema_version": 1,
        "source": "offline_fixture",
        "source_version": "fixture-demo-v1",
        "data_status": "sample",
        "window": {"start_year": 2024, "end_year": 2024, "n_years": 1},
        "generated_at": "2026-07-21T10:00:00+00:00",
    }


def _geography(session) -> tuple[Geography, AdminUnit]:
    geography = Geography(
        slug="madhya-pradesh",
        country="India",
        name="Madhya Pradesh",
    )
    session.add(geography)
    session.flush()
    admin_unit = AdminUnit(
        geography_id=geography.id,
        level="state",
        code="madhya-pradesh",
        name="Madhya Pradesh",
        bbox_north=26.87,
        bbox_west=74.02,
        bbox_south=21.08,
        bbox_east=82.82,
        note="test preset",
    )
    session.add(admin_unit)
    session.flush()
    return geography, admin_unit


def test_sample_era5_frame_is_rejected_by_default(session_factory) -> None:
    with session_factory() as session:
        geography = _geography(session)
        with (
            patch(
                "chart.shared.db.climate_load.ensure_mvp_geographies",
                return_value={"madhya-pradesh": geography},
            ),
            pytest.raises(ValueError, match="CLIMATE_SAMPLE_NOT_LIVE"),
        ):
            load_era5_monthly_frame(
                session,
                preset_slug="madhya-pradesh",
                df=_frame(),
                meta=_meta(),
                csv_path="/tmp/fixture.csv",
            )


def test_validated_fixture_persists_canonical_months_and_value_hash(
    session_factory,
) -> None:
    with session_factory() as session:
        geography = _geography(session)
        with patch(
            "chart.shared.db.climate_load.ensure_mvp_geographies",
            return_value={"madhya-pradesh": geography},
        ):
            first = load_era5_monthly_frame(
                session,
                preset_slug="madhya-pradesh",
                df=_frame(),
                meta=_meta(),
                csv_path="/tmp/fixture.csv",
                allow_sample=True,
            )
            changed_frame = _frame()
            changed_frame.loc[0, "tmax_monthly_mean_c"] = 30.5
            second = load_era5_monthly_frame(
                session,
                preset_slug="madhya-pradesh",
                df=changed_frame,
                meta=_meta(),
                csv_path="/tmp/fixture.csv",
                allow_sample=True,
            )
            session.commit()

        assert first.input_hash != second.input_hash
        assert len(first.input_hash) == 64
        assert session.scalar(select(func.count()).select_from(ClimateRun)) == 2
        assert session.scalar(select(func.count()).select_from(DistrictClimate)) == 72
        first_tmax = session.scalars(
            select(DistrictClimate).where(
                DistrictClimate.climate_run_id == first.id,
                DistrictClimate.variable == "tmax_monthly_mean_c",
            )
        ).all()
        assert len(first_tmax) == 12
        assert {row.unit for row in first_tmax} == {"degC"}
        assert {row.agg_method for row in first_tmax} == {"bbox_coslat_mean_v1"}


@pytest.mark.parametrize(
    ("mutate", "code"),
    [
        (lambda frame: frame.drop(index=1), "ERA5_MONTH_GAP"),
        (
            lambda frame: pd.concat([frame, frame.iloc[[0]]], ignore_index=True),
            "ERA5_DUPLICATE_MONTH",
        ),
        (
            lambda frame: frame.assign(
                tmax_monthly_max_c=frame["tmax_monthly_mean_c"] - 1
            ),
            "ERA5_TMAX_ORDER_INVALID",
        ),
    ],
)
def test_era5_audit_rejects_incomplete_or_invalid_values(
    session_factory, mutate, code: str
) -> None:
    with session_factory() as session:
        geography = _geography(session)
        with (
            patch(
                "chart.shared.db.climate_load.ensure_mvp_geographies",
                return_value={"madhya-pradesh": geography},
            ),
            pytest.raises(ValueError, match=code),
        ):
            load_era5_monthly_frame(
                session,
                preset_slug="madhya-pradesh",
                df=mutate(_frame()),
                meta=_meta(),
                csv_path="/tmp/fixture.csv",
                allow_sample=True,
            )


def test_era5_audit_rejects_unknown_status_instead_of_guessing_reanalysis(
    session_factory,
) -> None:
    meta = _meta()
    meta["data_status"] = "modeled"
    frame = _frame()
    frame["data_status"] = "modeled"

    with session_factory() as session:
        geography = _geography(session)
        with (
            patch(
                "chart.shared.db.climate_load.ensure_mvp_geographies",
                return_value={"madhya-pradesh": geography},
            ),
            pytest.raises(ValueError, match="ERA5_DATA_STATUS_INVALID"),
        ):
            load_era5_monthly_frame(
                session,
                preset_slug="madhya-pradesh",
                df=frame,
                meta=meta,
                csv_path="/tmp/fixture.csv",
                allow_sample=True,
            )


def test_exact_complete_months_can_be_loaded_without_a_full_calendar_year(
    session_factory,
) -> None:
    frame = _frame().iloc[4:6].copy()
    frame["observed_days"] = [31, 30]
    frame["expected_days"] = [31, 30]
    frame["quality_flag"] = "complete"
    meta = _meta()
    meta["requested_months"] = ["2024-05-01", "2024-06-01"]

    with session_factory() as session:
        geography = _geography(session)
        with patch(
            "chart.shared.db.climate_load.ensure_mvp_geographies",
            return_value={"madhya-pradesh": geography},
        ):
            run = load_era5_monthly_frame(
                session,
                preset_slug="madhya-pradesh",
                df=frame,
                meta=meta,
                csv_path="/tmp/era5-2024-05-06.csv",
                allow_sample=True,
            )
            session.commit()

        months = {
            row.period_month
            for row in session.scalars(
                select(DistrictClimate).where(
                    DistrictClimate.climate_run_id == run.id,
                    DistrictClimate.variable == "tmax_monthly_mean_c",
                )
            )
        }

    assert months == {
        pd.Timestamp("2024-05-01").date(),
        pd.Timestamp("2024-06-01").date(),
    }


def test_exact_month_load_rejects_partial_era5_data(session_factory) -> None:
    frame = _frame().iloc[5:6].copy()
    frame["observed_days"] = [29]
    frame["expected_days"] = [30]
    frame["quality_flag"] = "partial"
    meta = _meta()
    meta["requested_months"] = ["2024-06-01"]

    with session_factory() as session:
        geography = _geography(session)
        with (
            patch(
                "chart.shared.db.climate_load.ensure_mvp_geographies",
                return_value={"madhya-pradesh": geography},
            ),
            pytest.raises(ValueError, match="ERA5_MONTH_INCOMPLETE"),
        ):
            load_era5_monthly_frame(
                session,
                preset_slug="madhya-pradesh",
                df=frame,
                meta=meta,
                csv_path="/tmp/era5-2024-06.csv",
                allow_sample=True,
            )


def test_projection_metadata_survives_storage_and_builds_the_model_window(
    session_factory,
) -> None:
    manifest = ProjectionManifest(
        dataset_family="ISIMIP3b",
        dataset_name="bias-adjusted atmospheric climate input data",
        source_version="20210512",
        source_uri="https://doi.org/10.48364/ISIMIP.842396.1",
        source_license="CC0 1.0",
        source_calendar="gregorian",
        source_variable="tasmax",
        source_unit="degC",
        scenario="ssp370",
        approved_scenarios=("ssp126", "ssp370"),
        model_member="median of 5 approved climate models",
        bias_adjustment="W5E5 v2.0",
        downscaling_method="native 0.5 degree grid; no local downscaling",
        generated_at=datetime(2026, 7, 22, tzinfo=timezone.utc),
        admin_unit_code="madhya-pradesh",
        admin_unit_level="state",
        boundary_version="mp-test-v1",
        projection_period_start=date(2031, 1, 1),
        projection_period_end=date(2040, 12, 31),
    )
    records = adapt_projection_months(
        manifest,
        [
            ProjectionMonthValue(date(2040, 3, 1), 36.0),
            ProjectionMonthValue(date(2040, 4, 1), 39.0),
            ProjectionMonthValue(date(2040, 5, 1), 41.0),
        ],
    )

    with session_factory() as session:
        _, admin_unit = _geography(session)
        admin_unit.boundary_version = "mp-test-v1"
        run = load_monthly_climate_records(
            session,
            admin_unit=admin_unit,
            records=records,
            raw_object_uri="/data/manifest.json",
            raw_object_hash="a" * 64,
            provider="ISIMIP",
            product="ISIMIP3b InputData tasmax",
            access_method="isimip_files_api_v2",
        )
        session.commit()

        window = build_and_persist_input_window(
            session,
            admin_unit_id=admin_unit.id,
            target_end_month=date(2040, 5, 1),
            live=True,
            now=datetime(2026, 7, 22, tzinfo=timezone.utc),
            projection_scenario="ssp370",
            projection_period="2031-2040",
        )

        assert run.window_start_year == 2031
        assert run.window_end_year == 2040
        assert run.bias_adjustment == "W5E5 v2.0"
        assert window.target_end_month == date(2040, 5, 1)
