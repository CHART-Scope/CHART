"""The durable, shared record of what a model said about a place and a month.

These pin the properties that motivated the table: one row per grain however
many times it is computed, a stored fraction that equals the displayed one,
and a refusal to store a result that disagrees with its own request.
"""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from chart.climate.prediction_results import (
    climate_data_label,
    integrity_problem,
    upsert_prediction_result,
)
from chart.climate.schemas import PredictResponse
from chart.shared.db.models import (
    AdminUnit,
    Base,
    DataLabel,
    Geography,
    ModelRelease,
    PredictionResult,
)

GEO = "geo-in-madhya-pradesh-division-bhopal"


def _payload(
    *,
    odds_ratio: float = 1.25,
    reference: float = 28.0,
    temperatures=(32.0, 32.0, 32.0),
    months=(8, 7, 6),
    source_class: str = "observed",
    data_label: str = "reanalysis",
    geography_id: str = GEO,
    pregnancy_window: int | None = 1,
) -> dict:
    return {
        "place": {
            "geography_id": geography_id,
            "code": "bhopal",
            "name": "Bhopal",
            "level": "division",
            "path": "/india/madhya-pradesh/bhopal",
            "supports_prediction": True,
        },
        "planning_date": "2026-08-01",
        "availability": {
            "status": "ready",
            "months_found": 3,
            "missing_months": [],
            "message": "Ready",
        },
        "climate": [
            {
                "month": f"2026-{month:02d}",
                "temperature_c": temperature,
                "status": "ready",
                "source_class": source_class,
                "data_label": data_label,
                "expected_source_name": "ERA5",
                "source_policy_version": "test",
            }
            for month, temperature in zip(months, temperatures)
        ],
        "prediction": {
            "area": "Bhopal",
            "geography_level": "division",
            "pregnancy_window": pregnancy_window,
            "temperatures_c": list(temperatures),
            "reference_temperature_c": reference,
            "odds_ratio": odds_ratio,
            "ci95_low": odds_ratio * 0.8,
            "ci95_high": odds_ratio * 1.2,
            "on_training_support": True,
            "model_file": "review.rds",
            "model_version": "test-v1",
        },
        "request_id": 1,
    }


@pytest.fixture
def session():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    with factory() as s:
        geography = Geography(slug="in-mp", country="India", name="Madhya Pradesh")
        s.add(geography)
        s.flush()
        unit = AdminUnit(
            geography_id=geography.id, level="division", code="bhopal", name="Bhopal"
        )
        s.add(unit)
        s.add(
            ModelRelease(
                id="test-release",
                module="prediction",
                outcome="lbw",
                version="test-v1",
                status="active",
                model_files=[],
                input_spec={},
            )
        )
        s.flush()
        s.unit_id = unit.id
        yield s


def _store(session, payload, outcome="lbw"):
    return upsert_prediction_result(
        session,
        result=PredictResponse.model_validate(payload),
        admin_unit_id=session.unit_id,
        outcome=outcome,
        model_release_id="test-release",
        valid_month=date(2026, 8, 1),
    )


def test_recomputing_a_month_updates_one_row_rather_than_adding_another(
    session,
) -> None:
    """The whole point of the grain.

    The request table forks a row per user per day; the result must not.
    """
    _store(session, _payload(odds_ratio=1.25))
    _store(session, _payload(odds_ratio=1.40))

    rows = list(session.scalars(select(PredictionResult)))
    assert len(rows) == 1
    assert rows[0].odds_ratio == 1.40


def test_a_second_outcome_for_the_same_month_is_its_own_row(session) -> None:
    """Why health_impact could not be used: its grain has no outcome."""
    session.add(
        ModelRelease(
            id="u5-release",
            module="prediction",
            outcome="under_5_mortality",
            version="test-v1",
            status="active",
            model_files=[],
            input_spec={},
        )
    )
    session.flush()
    _store(session, _payload())
    upsert_prediction_result(
        session,
        result=PredictResponse.model_validate(_payload(pregnancy_window=None)),
        admin_unit_id=session.unit_id,
        outcome="under_5_mortality",
        model_release_id="u5-release",
        valid_month=date(2026, 8, 1),
    )
    assert len(list(session.scalars(select(PredictionResult)))) == 2


def test_a_different_pregnancy_window_does_not_overwrite_the_final_one(
    session,
) -> None:
    """Two trimesters are two predictions, not one revised twice."""
    _store(session, _payload(pregnancy_window=1, odds_ratio=1.25))
    _store(session, _payload(pregnancy_window=2, odds_ratio=1.60))

    rows = sorted(
        session.scalars(select(PredictionResult)), key=lambda r: r.pregnancy_window
    )
    assert [r.pregnancy_window for r in rows] == [1, 2]
    assert [r.odds_ratio for r in rows] == [1.25, 1.60]


def test_the_stored_fraction_is_the_clamped_one_the_card_shows(session) -> None:
    """Stored must equal displayed.

    The health_impact bridge computes this without the temperature and the
    reference, so it would store a non-zero share for a month the dashboard
    reports as zero. Real case: Bhopal January, 24 C against a 27 C
    reference, odds ratio 1.33.
    """
    below = _store(
        session,
        _payload(odds_ratio=1.33, reference=27.0, temperatures=(24.0, 24.0, 24.0)),
    )
    assert below.attributable_fraction_milli == 0

    above = _store(
        session,
        _payload(odds_ratio=1.33, reference=27.0, temperatures=(32.0, 32.0, 32.0)),
    )
    # (1.33 - 1) / 1.33 = 0.248
    assert above.attributable_fraction_milli == 248


def test_the_data_label_describes_the_climate_actually_scored(session) -> None:
    """Not whether a projection scenario was asked for.

    A month built on seasonal forecast or sample data is a real prediction but
    not an observed month, and the monthly card reports observed months.
    """
    observed = PredictResponse.model_validate(_payload())
    seasonal = PredictResponse.model_validate(_payload(source_class="seasonal"))
    sampled = PredictResponse.model_validate(_payload(data_label="sample"))

    assert climate_data_label(observed) is DataLabel.reanalysis
    assert climate_data_label(seasonal) is DataLabel.forecast
    assert climate_data_label(sampled) is DataLabel.sample


def test_a_result_that_disagrees_with_its_request_is_refused() -> None:
    """Better to refuse than to store a contradiction.

    These were read-time guards that quietly skipped a row on every request.
    Checked once on the way in, a mismatch is a fault to report.
    """
    wrong_place = PredictResponse.model_validate(
        _payload(geography_id="geo-ke-baringo")
    )
    assert "place mismatch" in (
        integrity_problem(wrong_place, geography_id=GEO, valid_month=date(2026, 8, 1))
        or ""
    )

    wrong_window = PredictResponse.model_validate(_payload(months=(8, 7, 5)))
    assert "climate window" in (
        integrity_problem(wrong_window, geography_id=GEO, valid_month=date(2026, 8, 1))
        or ""
    )

    sound = PredictResponse.model_validate(_payload())
    assert (
        integrity_problem(sound, geography_id=GEO, valid_month=date(2026, 8, 1)) is None
    )
