"""The day-grain input window the under-five models are scored on.

A planner picks a month; these models read four consecutive days. The model was
fitted one profile per death - the day and the three before it - so a month is
every such profile in it, averaged. The rules that turn one into the other
decide what the stored number means, so they are pinned here rather than left
to whatever the query happened to return.
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from chart.climate.daily_windows import (
    ClimateInputError,
    build_and_persist_daily_input_window,
    daily_contract,
    read_daily_input_dates,
    read_daily_input_values,
    series_span,
    trailing_profiles,
)
from chart.shared.db.models import (
    AdminUnit,
    Base,
    ClimateRun,
    DataSource,
    DistrictClimateDay,
    Geography,
    Provenance,
)


def test_a_month_is_one_profile_per_day_each_trailing_into_the_days_before() -> None:
    """The shape the model was fitted on: `crossbasis(lag_matrix[, 1:4], lag = 3)`.

    The series runs newest first and carries the lead-in at its tail, so the
    windows slide straight off it.
    """
    # 3 May back to 28 April: a 3-day month would need a 3-day lead-in.
    series = (36.0, 35.0, 34.0, 33.0, 32.0, 31.0)
    assert trailing_profiles(series, 4) == (
        (36.0, 35.0, 34.0, 33.0),
        (35.0, 34.0, 33.0, 32.0),
        (34.0, 33.0, 32.0, 31.0),
    )


def test_the_month_is_averaged_rather_than_reduced_to_its_hottest_run() -> None:
    """The regression guard for what `peak_consecutive_window` used to do.

    One scorching four-day episode in a mild month must not stand for the
    month: it is one profile among many, not the month's answer.
    """
    mild = [30.0] * 20
    episode = [44.0] * 4
    series = tuple(episode + mild)
    profiles = trailing_profiles(series, 4)
    assert len(profiles) == len(series) - 3
    hottest = max(sum(p) / 4 for p in profiles)
    average = sum(sum(p) / 4 for p in profiles) / len(profiles)
    assert hottest == 44.0
    assert average < hottest


def test_the_span_reaches_back_into_the_previous_month_for_the_lead_in() -> None:
    """The 1st is scored against days that are not in the month being asked for."""
    first, last = series_span(date(2026, 5, 1), 4)
    assert first == date(2026, 4, 28)
    assert last == date(2026, 5, 31)


def test_daily_contract_identifies_the_grain_a_release_reads() -> None:
    under_five = {"input_contract": {"variables": [{"interval": "day", "length": 4}]}}
    lbw = {"input_contract": {"variables": [{"interval": "month", "length": 3}]}}
    assert daily_contract(under_five) == (4, "trailing_window_mean")
    assert daily_contract(lbw) is None
    assert daily_contract(None) is None


def test_daily_contract_rejects_a_daily_release_with_no_usable_length() -> None:
    with pytest.raises(ClimateInputError):
        daily_contract({"input_contract": {"variables": [{"interval": "day"}]}})


@pytest.fixture
def session():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    with factory() as s:
        geography = Geography(slug="test", country="Test", name="Test")
        s.add(geography)
        s.flush()
        unit = AdminUnit(
            geography_id=geography.id, level="district", code="testville", name="Test"
        )
        source = DataSource(geography_id=geography.id, name="era5", kind="climate")
        provenance = Provenance(source_uri="test://", input_hash="h", license="test")
        s.add_all([unit, source, provenance])
        s.flush()
        run = ClimateRun(
            data_source_id=source.id,
            provenance_id=provenance.id,
            tier="observed",
            input_hash="run-hash",
            data_label="reanalysis",
        )
        s.add(run)
        s.flush()
        s.unit_id, s.run_id = unit.id, run.id
        yield s


def _seed_span(s, first: date, last: date, value: float = 30.0) -> None:
    """Every day from `first` to `last`, which is what a month now needs."""
    day = first
    while day <= last:
        s.add(
            DistrictClimateDay(
                admin_unit_id=s.unit_id,
                climate_run_id=s.run_id,
                period_date=day,
                variable="tmax_c",
                value=value + day.day / 100,
                agg_method="bbox_coslat_mean_v1",
                unit="degC",
            )
        )
        day += timedelta(days=1)
    s.flush()


def test_a_persisted_window_holds_the_whole_month_and_its_lead_in(session) -> None:
    _seed_span(session, date(2026, 4, 28), date(2026, 5, 31))
    window = build_and_persist_daily_input_window(
        session,
        admin_unit_id=session.unit_id,
        target_end_month=date(2026, 5, 1),
        length=4,
    )
    assert window.grain == "day"
    assert window.target_end_date == date(2026, 5, 31)
    values = read_daily_input_values(session, window)
    dates = read_daily_input_dates(session, window)
    # 31 days of May plus the three April days the 1st is scored against.
    assert len(values) == 34
    # Lag 0 is the most recent day, matching the manifests' newest_first order.
    assert dates[0] == date(2026, 5, 31)
    assert dates[-1] == date(2026, 4, 28)
    # One profile per day of May, and the last reaches back into April.
    profiles = trailing_profiles(values, 4)
    assert len(profiles) == 31
    assert profiles[0] == values[0:4]


def test_the_same_window_is_reused_rather_than_duplicated(session) -> None:
    _seed_span(session, date(2026, 4, 28), date(2026, 5, 31))
    first = build_and_persist_daily_input_window(
        session,
        admin_unit_id=session.unit_id,
        target_end_month=date(2026, 5, 1),
        length=4,
    )
    second = build_and_persist_daily_input_window(
        session,
        admin_unit_id=session.unit_id,
        target_end_month=date(2026, 5, 1),
        length=4,
    )
    assert first.id == second.id


def test_a_month_missing_even_one_day_is_refused_with_a_reason(
    session,
) -> None:
    """Better an explicit refusal than a month quietly averaged over a gap.

    Every day of the month is scored, so a missing day is a missing profile,
    and dropping it would move the mean without saying so.
    """
    _seed_span(session, date(2026, 4, 28), date(2026, 5, 31))
    session.query(DistrictClimateDay).filter(
        DistrictClimateDay.period_date == date(2026, 5, 17)
    ).delete()
    session.flush()
    with pytest.raises(ClimateInputError) as caught:
        build_and_persist_daily_input_window(
            session,
            admin_unit_id=session.unit_id,
            target_end_month=date(2026, 5, 1),
            length=4,
        )
    assert caught.value.code == "CLIMATE_DAILY_DATA_NOT_READY"


def test_an_unsupported_batch_profile_is_refused(session) -> None:
    _seed_span(session, date(2026, 4, 28), date(2026, 5, 31))
    with pytest.raises(ClimateInputError) as caught:
        build_and_persist_daily_input_window(
            session,
            admin_unit_id=session.unit_id,
            target_end_month=date(2026, 5, 1),
            length=4,
            batch_profile="month_mean_repeated",
        )
    assert caught.value.code == "MODEL_BATCH_PROFILE_UNSUPPORTED"
