"""Reset must survive the tables added after it was written.

`reset()` deletes children before parents, which only works while the list
knows about every child. Three tables landed after it — `district_climate_day`,
`climate_input_day` and `prediction_result` — and the daily table's foreign
keys to `climate_run` and `admin_unit` carry no ``ondelete``, so they default
to RESTRICT. A reset with daily rows present would have failed on them.

This is the regression guard for that ordering, run with foreign keys enforced
so a missing delete is an error rather than an orphan.
"""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from chart.auth.service import CurrentUserContext
from chart.setup import service as setup_service
from chart.shared.db.models import (
    AdminUnit,
    Base,
    ClimateInputDayRecord,
    ClimateInputWindowRecord,
    ClimateRun,
    DataLabel,
    DataSource,
    DistrictClimate,
    DistrictClimateDay,
    Geography,
    ModelRelease,
    PredictionResult,
    Provenance,
    SetupStateRecord,
)


@pytest.fixture
def session_factory():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )

    @event.listens_for(engine, "connect")
    def _enforce_foreign_keys(dbapi_connection, _record):
        # Without this SQLite ignores foreign keys entirely and the ordering
        # bug this test exists for would pass silently.
        dbapi_connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def _seed_a_full_installation(session_factory) -> None:
    """Everything a reset has to unpick, including the newer tables."""
    with session_factory() as session:
        session.add(SetupStateRecord(id="default", phase="ready", completed=True))
        geography = Geography(slug="ke", country="Kenya", name="Kenya")
        session.add(geography)
        session.flush()

        unit = AdminUnit(
            geography_id=geography.id, level="county", code="kajiado", name="Kajiado"
        )
        source = DataSource(geography_id=geography.id, name="era5", kind="climate")
        provenance = Provenance(source_uri="s://", input_hash="h", license="t")
        session.add_all([unit, source, provenance])
        session.flush()

        run = ClimateRun(
            data_source_id=source.id,
            provenance_id=provenance.id,
            tier="observed",
            input_hash="run-hash",
            data_label=DataLabel.reanalysis,
        )
        release = ModelRelease(
            id="rel-1",
            module="prediction",
            outcome="lbw",
            version="1",
            status="active",
            model_files=[],
            input_spec={},
        )
        session.add_all([run, release])
        session.flush()

        session.add(
            DistrictClimate(
                admin_unit_id=unit.id,
                climate_run_id=run.id,
                period_month=date(2026, 8, 1),
                variable="tmax_monthly_mean_c",
                value=31.0,
            )
        )
        day = DistrictClimateDay(
            admin_unit_id=unit.id,
            climate_run_id=run.id,
            period_date=date(2026, 8, 14),
            variable="tmax_c",
            value=33.0,
        )
        window = ClimateInputWindowRecord(
            admin_unit_id=unit.id,
            target_end_month=date(2026, 8, 1),
            grain="day",
            input_hash="window-hash",
            contract_version="daily-v1",
        )
        session.add_all([day, window])
        session.flush()
        session.add(
            ClimateInputDayRecord(
                climate_input_window_id=window.id,
                district_climate_day_id=day.id,
                lag_index=0,
            )
        )
        session.add(
            PredictionResult(
                admin_unit_id=unit.id,
                outcome="lbw",
                model_release_id="rel-1",
                valid_month=date(2026, 8, 1),
                scenario="seas5_ensemble",
                horizon="m1",
                pregnancy_window=1,
                odds_ratio=1.1,
                ci95_low=0.9,
                ci95_high=1.3,
                attributable_fraction_milli=90,
                model_version="1",
                data_label=DataLabel.reanalysis,
            )
        )
        session.commit()


def test_reset_clears_the_newer_tables_instead_of_tripping_their_keys(
    session_factory, monkeypatch
) -> None:
    """The bug: daily rows blocked the delete of the run they belong to."""
    _seed_a_full_installation(session_factory)
    monkeypatch.setattr(setup_service, "get_session_factory", lambda: session_factory)
    monkeypatch.setattr(setup_service, "get_status", lambda: None)

    setup_service.reset(
        CurrentUserContext(
            user_id="admin-1",
            username="admin",
            roles=["chart_admin"],
            geography_scopes=["/kenya"],
        )
    )

    with session_factory() as session:
        for model in (
            DistrictClimateDay,
            ClimateInputDayRecord,
            PredictionResult,
            DistrictClimate,
            ClimateRun,
            AdminUnit,
        ):
            remaining = session.scalars(select(model)).all()
            assert remaining == [], f"{model.__tablename__} survived the reset"


def test_reset_refuses_a_caller_without_the_admin_role(session_factory) -> None:
    with pytest.raises(setup_service.SetupError):
        setup_service.reset(
            CurrentUserContext(
                user_id="planner-1",
                username="planner",
                roles=["health_planning_lead"],
                geography_scopes=["/kenya"],
            )
        )
