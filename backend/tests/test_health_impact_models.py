"""Round-trip tests for erf_parameters, covariate, and health_impact.

These prove the schema is coherent: relationships resolve, uniqueness is
enforced at the grain the dashboard reads at, and the CI ordering
invariant on health_impact cannot be violated by a bad writer.
"""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from chart.shared.db.base import Base
from chart.shared.db.models import (
    AdminUnit,
    ClimateRun,
    Covariate,
    DataLabel,
    DataSource,
    ErfParameters,
    Geography,
    HealthImpact,
    Provenance,
)


@pytest.fixture
def session_factory():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with engine.begin() as connection:
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def _seed_reference_graph(session: Session) -> tuple[Geography, AdminUnit, ClimateRun]:
    """Insert the parents every health_impact row needs.

    Keeps individual test cases short. Returns the three anchors so callers
    can point their new rows at them.
    """

    geography = Geography(slug="mp", country="India", name="Madhya Pradesh")
    session.add(geography)
    session.flush()

    admin_unit = AdminUnit(
        geography_id=geography.id,
        level="district",
        code="MP-BAR",
        name="Barwani",
    )
    session.add(admin_unit)

    provenance = Provenance(source_uri="s3://climate/mp.zarr", input_hash="c" * 64)
    data_source = DataSource(name="ISIMIP3b", kind="projection")
    session.add_all([provenance, data_source])
    session.flush()

    climate_run = ClimateRun(
        data_source_id=data_source.id,
        provenance_id=provenance.id,
        tier="projection",
        input_hash="r" * 64,
        scenario="rcp45",
        data_label=DataLabel.projection,
    )
    session.add(climate_run)
    session.flush()

    return geography, admin_unit, climate_run


def test_erf_parameters_round_trip(session_factory) -> None:
    with session_factory() as session:
        geography, _, _ = _seed_reference_graph(session)

        session.add(
            ErfParameters(
                geography_id=geography.id,
                outcome="lbw",
                spline_coefficients={"knots": [22.0, 27.0, 33.0], "coefs": [0.1, 0.4]},
                lag_window={"months": [1, 2, 3], "trimester_weights": [0.3, 0.4, 0.3]},
                reference_percentile_milli=27000,
                projection_source="ISIMIP3b",
                git_ref="modeler-abc123",
                notes="Placeholder MP curve for scaffolding.",
            )
        )
        session.commit()

    with session_factory() as session:
        stored = session.scalars(select(ErfParameters)).one()
        assert stored.outcome == "lbw"
        assert stored.reference_percentile_milli == 27000
        assert stored.spline_coefficients["knots"] == [22.0, 27.0, 33.0]
        assert stored.lag_window["trimester_weights"] == [0.3, 0.4, 0.3]
        assert stored.published_at is not None


def test_erf_parameters_unique_on_geography_outcome_git_ref(session_factory) -> None:
    with session_factory() as session:
        geography, _, _ = _seed_reference_graph(session)
        base = dict(
            geography_id=geography.id,
            outcome="lbw",
            spline_coefficients={"k": 1},
            lag_window={"m": [1]},
            reference_percentile_milli=27000,
            git_ref="modeler-abc123",
        )
        session.add(ErfParameters(**base))
        session.commit()

        session.add(ErfParameters(**base))
        with pytest.raises(IntegrityError):
            session.commit()


def test_covariate_round_trip_and_default_scenario_socio(session_factory) -> None:
    with session_factory() as session:
        _, admin_unit, _ = _seed_reference_graph(session)
        provenance = Provenance(
            source_uri="s3://worldpop/ssp2/mp.tif", input_hash="p" * 64
        )
        session.add(provenance)
        session.flush()

        session.add(
            Covariate(
                admin_unit_id=admin_unit.id,
                provenance_id=provenance.id,
                kind="population",
                valid_year=2041,
                value=1_500_000.0,
                unit="persons",
                data_label=DataLabel.projection,
            )
        )
        session.commit()

    with session_factory() as session:
        stored = session.scalars(select(Covariate)).one()
        assert stored.kind == "population"
        assert stored.scenario_socio == "ssp2"
        assert stored.value == 1_500_000.0
        assert stored.unit == "persons"


def test_health_impact_round_trip(session_factory) -> None:
    with session_factory() as session:
        geography, admin_unit, climate_run = _seed_reference_graph(session)
        erf = ErfParameters(
            geography_id=geography.id,
            outcome="lbw",
            spline_coefficients={"k": 1},
            lag_window={"m": [1]},
            reference_percentile_milli=27000,
            git_ref="modeler-abc123",
        )
        session.add(erf)
        session.flush()

        session.add(
            HealthImpact(
                admin_unit_id=admin_unit.id,
                erf_parameters_id=erf.id,
                climate_run_id=climate_run.id,
                scenario="rcp45",
                horizon="y15",
                valid_month=date(2041, 7, 1),
                relative_risk_milli=1150,
                rr_ci_low_milli=1050,
                rr_ci_high_milli=1280,
                attributable_fraction_milli=130,
                attributable_number=195,
                ensemble_spread_milli=180,
                data_label=DataLabel.modeled,
            )
        )
        session.commit()

    with session_factory() as session:
        stored = session.scalars(select(HealthImpact)).one()
        assert stored.scenario == "rcp45"
        assert stored.horizon == "y15"
        assert stored.valid_month == date(2041, 7, 1)
        assert stored.relative_risk_milli == 1150
        assert stored.attributable_number == 195
        assert stored.data_label is DataLabel.modeled


def test_health_impact_unique_on_dashboard_grain(session_factory) -> None:
    with session_factory() as session:
        geography, admin_unit, climate_run = _seed_reference_graph(session)
        erf = ErfParameters(
            geography_id=geography.id,
            outcome="lbw",
            spline_coefficients={"k": 1},
            lag_window={"m": [1]},
            reference_percentile_milli=27000,
            git_ref="modeler-abc123",
        )
        session.add(erf)
        session.flush()

        row = dict(
            admin_unit_id=admin_unit.id,
            erf_parameters_id=erf.id,
            climate_run_id=climate_run.id,
            scenario="rcp45",
            horizon="y15",
            valid_month=date(2041, 7, 1),
            relative_risk_milli=1150,
            rr_ci_low_milli=1050,
            rr_ci_high_milli=1280,
            attributable_fraction_milli=130,
            data_label=DataLabel.modeled,
        )
        session.add(HealthImpact(**row))
        session.commit()

        session.add(HealthImpact(**row))
        with pytest.raises(IntegrityError):
            session.commit()


def test_health_impact_ci_ordering_is_enforced(session_factory) -> None:
    with session_factory() as session:
        geography, admin_unit, climate_run = _seed_reference_graph(session)
        erf = ErfParameters(
            geography_id=geography.id,
            outcome="lbw",
            spline_coefficients={"k": 1},
            lag_window={"m": [1]},
            reference_percentile_milli=27000,
            git_ref="modeler-abc123",
        )
        session.add(erf)
        session.flush()

        session.add(
            HealthImpact(
                admin_unit_id=admin_unit.id,
                erf_parameters_id=erf.id,
                climate_run_id=climate_run.id,
                scenario="rcp45",
                horizon="y15",
                valid_month=date(2041, 7, 1),
                relative_risk_milli=1150,
                rr_ci_low_milli=1200,
                rr_ci_high_milli=1100,
                attributable_fraction_milli=130,
                data_label=DataLabel.modeled,
            )
        )
        with pytest.raises(IntegrityError):
            session.commit()


def test_health_impact_negative_attributable_number_rejected(session_factory) -> None:
    with session_factory() as session:
        geography, admin_unit, climate_run = _seed_reference_graph(session)
        erf = ErfParameters(
            geography_id=geography.id,
            outcome="lbw",
            spline_coefficients={"k": 1},
            lag_window={"m": [1]},
            reference_percentile_milli=27000,
            git_ref="modeler-abc123",
        )
        session.add(erf)
        session.flush()

        session.add(
            HealthImpact(
                admin_unit_id=admin_unit.id,
                erf_parameters_id=erf.id,
                climate_run_id=climate_run.id,
                scenario="rcp45",
                horizon="y15",
                valid_month=date(2041, 7, 1),
                relative_risk_milli=1150,
                rr_ci_low_milli=1050,
                rr_ci_high_milli=1280,
                attributable_fraction_milli=130,
                attributable_number=-1,
                data_label=DataLabel.modeled,
            )
        )
        with pytest.raises(IntegrityError):
            session.commit()
