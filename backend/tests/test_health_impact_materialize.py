"""Bridge tests: pure math + end-to-end persistence."""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from chart.health_impact import (
    ErfParametersNotFound,
    MaterializationInput,
    attributable_fraction_milli,
    attributable_number,
    materialize_health_impact,
    relative_risk_milli,
)
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


# ---------- derivation.py: pure math ----------------------------------------


@pytest.mark.parametrize("odds_ratio,expected", [(0.0, 0), (0.5, 500), (1.15, 1150)])
def test_relative_risk_milli(odds_ratio: float, expected: int) -> None:
    assert relative_risk_milli(odds_ratio) == expected


@pytest.mark.parametrize(
    "odds_ratio,expected",
    [(0.9, 0), (1.0, 0), (1.15, round((0.15 / 1.15) * 1000))],
)
def test_attributable_fraction_milli(odds_ratio: float, expected: int) -> None:
    assert attributable_fraction_milli(odds_ratio) == expected


def test_attributable_number_multiplies_fraction_by_population() -> None:
    assert attributable_number(130, 1_500_000) == round(130 * 1_500_000 / 1000)


def test_attributable_number_is_none_without_population() -> None:
    assert attributable_number(130, None) is None


def test_attributable_number_rejects_negative_population() -> None:
    with pytest.raises(ValueError):
        attributable_number(130, -1)


# ---------- materialize.py: end-to-end persistence --------------------------


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


def _seed_prerequisites(
    session: Session, *, publish_erf: bool = True
) -> MaterializationInput:
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
        scenario="ssp245",
        data_label=DataLabel.projection,
    )
    session.add(climate_run)
    session.flush()

    if publish_erf:
        session.add(
            ErfParameters(
                geography_id=geography.id,
                outcome="lbw",
                spline_coefficients={"knots": [22.0, 27.0, 33.0]},
                lag_window={"months": [1, 2, 3]},
                reference_percentile_milli=27000,
                git_ref="modeler-abc123",
            )
        )

    pop_prov = Provenance(source_uri="s3://worldpop/ssp2/mp.tif", input_hash="p" * 64)
    session.add(pop_prov)
    session.flush()

    session.add(
        Covariate(
            admin_unit_id=admin_unit.id,
            provenance_id=pop_prov.id,
            kind="population",
            scenario_socio="ssp2",
            valid_year=2041,
            value=1_500_000.0,
            data_label=DataLabel.projection,
        )
    )
    session.flush()

    return MaterializationInput(
        admin_unit_id=admin_unit.id,
        geography_id=geography.id,
        outcome="lbw",
        planning_target="long_term_hot_season",
        valid_month=date(2041, 7, 1),
        climate_run_id=climate_run.id,
        ssp_scenario="ssp245",
        odds_ratio=1.15,
        ci95_low=1.05,
        ci95_high=1.28,
        ensemble_spread=0.18,
    )


def test_materialize_writes_a_new_row_with_expected_values(session_factory) -> None:
    with session_factory() as session:
        spec = _seed_prerequisites(session)
        result = materialize_health_impact(session, spec)
        session.commit()
        assert result.created is True
        row = result.row
        assert row.scenario == "rcp45"
        assert row.horizon == "y15"
        assert row.valid_month == date(2041, 7, 1)
        assert row.relative_risk_milli == 1150
        assert row.rr_ci_low_milli == 1050
        assert row.rr_ci_high_milli == 1280
        assert row.attributable_fraction_milli == round((0.15 / 1.15) * 1000)
        assert row.attributable_number == round(
            row.attributable_fraction_milli * 1_500_000 / 1000
        )
        assert row.ensemble_spread_milli == 180
        assert row.data_label is DataLabel.projection


def test_materialize_upserts_the_same_grain_on_retry(session_factory) -> None:
    with session_factory() as session:
        spec = _seed_prerequisites(session)
        first = materialize_health_impact(session, spec)
        session.commit()

        updated_spec = MaterializationInput(
            **{
                **spec.__dict__,
                "odds_ratio": 1.30,
                "ci95_low": 1.20,
                "ci95_high": 1.42,
            }
        )
        second = materialize_health_impact(session, updated_spec)
        session.commit()

        assert first.created is True
        assert second.created is False
        assert first.row.id == second.row.id

        rows = session.scalars(select(HealthImpact)).all()
        assert len(rows) == 1
        assert rows[0].relative_risk_milli == 1300


def test_materialize_falls_back_to_seas5_ensemble_when_no_scenario(
    session_factory,
) -> None:
    with session_factory() as session:
        spec = _seed_prerequisites(session)
        no_scenario = MaterializationInput(
            **{
                **spec.__dict__,
                "ssp_scenario": None,
                "planning_target": "next_three_months",
            }
        )
        result = materialize_health_impact(session, no_scenario)
        session.commit()
        assert result.row.scenario == "seas5_ensemble"
        assert result.row.horizon == "m3"
        assert result.row.data_label is DataLabel.forecast


def test_materialize_leaves_attributable_number_null_when_population_missing(
    session_factory,
) -> None:
    with session_factory() as session:
        spec = _seed_prerequisites(session)
        no_pop_spec = MaterializationInput(
            **{**spec.__dict__, "valid_month": date(2999, 7, 1)}
        )
        result = materialize_health_impact(session, no_pop_spec)
        session.commit()
        assert result.row.attributable_fraction_milli > 0
        assert result.row.attributable_number is None


def test_materialize_raises_when_no_erf_is_published(session_factory) -> None:
    with session_factory() as session:
        spec = _seed_prerequisites(session, publish_erf=False)
        with pytest.raises(ErfParametersNotFound):
            materialize_health_impact(session, spec)


def test_materialize_preserves_legacy_ssp_label_without_rcp_pair(session_factory) -> None:
    with session_factory() as session:
        spec = _seed_prerequisites(session)
        legacy_spec = MaterializationInput(
            **{**spec.__dict__, "ssp_scenario": "ssp370"}
        )
        result = materialize_health_impact(session, legacy_spec)
        session.commit()
        assert result.row.scenario == "ssp370"
