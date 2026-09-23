"""Select and persist the exact daily values a day-grain model may be sent.

The month-grain sibling of this module is :mod:`chart.climate.input_windows`.
Both exist for the same reason: a model must be scored on observations that
were chosen once, recorded, and never silently re-derived, so a stored
prediction can always be traced back to the numbers that produced it.

What is different here is that a planner picks a *month* while an under-five
model reads *four consecutive days*. The model was fitted on one such profile
per death - the day it happened and the three before it - so a month is not
one profile but one per day in it, scored together and averaged. That is a
modelling decision rather than an implementation detail, so it is named in the
manifest (``input_contract.batch_profile``) and recorded on the window, never
inferred quietly here.
"""

from __future__ import annotations

import hashlib
import json
from calendar import monthrange
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from chart.shared.db.models import (
    AdminUnit,
    ClimateInputDayRecord,
    ClimateInputWindowRecord,
    DistrictClimateDay,
)

from .input_windows import ClimateInputError

#: Bumped when the meaning of a persisted daily window changes.
DAILY_CONTRACT_VERSION = "daily-v1"

#: The variable a day-grain model reads. Matches the series the ERA5 pipeline
#: produces (``to_daily_tmax_c``).
DAILY_VARIABLE = "tmax_c"

#: How a month is presented to a day-grain model.
#:
#: ``trailing_window_mean`` scores every day of the month on the profile the
#: model was fitted with - that day and the ``length - 1`` days before it - and
#: takes the mean of the resulting odds ratios. It is the only reduction that
#: matches the fit: the under-five case-crossover used
#: ``crossbasis(lag_matrix[, 1:4], lag = 3)`` over daily maximum temperature,
#: one row per death.
#:
#: It replaced ``peak_consecutive_window``, which scored the month's hottest run
#: of consecutive days. That answered a question nobody had fitted a model to
#: and biased every month upward by construction, because picking the maximum
#: of many windows is not an estimate of any of them.
TRAILING_WINDOW_MEAN = "trailing_window_mean"
SUPPORTED_BATCH_PROFILES = frozenset({TRAILING_WINDOW_MEAN})


def daily_contract(input_spec: dict | None) -> tuple[int, str] | None:
    """``(length, batch_profile)`` when a release reads daily lags, else None.

    This is the single place that decides which grain a model belongs to.
    Both the prepare step and the scoring step ask it, so a release can never
    have its window built at one grain and be scored at another.
    """
    contract = (input_spec or {}).get("input_contract") or {}
    variables = contract.get("variables") or []
    if len(variables) != 1:
        return None
    variable = variables[0]
    if variable.get("interval") != "day":
        return None
    length = variable.get("length")
    if not isinstance(length, int) or length < 1:
        raise ClimateInputError(
            "MODEL_INPUT_CONTRACT_INVALID", f"daily length={length!r}"
        )
    return length, contract.get("batch_profile") or TRAILING_WINDOW_MEAN


def month_days(target_end_month: date) -> tuple[date, date]:
    """First and last calendar day of the month a target falls in."""
    first = target_end_month.replace(day=1)
    return first, first.replace(day=monthrange(first.year, first.month)[1])


def series_span(target_end_month: date, length: int) -> tuple[date, date]:
    """Every day the month's scoring needs, the lead-in included.

    The first of the month is scored on itself and the ``length - 1`` days
    before it, which fall in the previous month. Those days are part of the
    input even though they are not part of the month being reported.
    """
    first, last = month_days(target_end_month)
    return first - timedelta(days=length - 1), last


def _load_series(
    session: Session,
    *,
    admin_unit_id: int,
    target_end_month: date,
    length: int,
    variable: str,
) -> list[DistrictClimateDay]:
    """The month's days plus the lead-in, one row per date, newest first.

    Picks the winner for each date explicitly rather than trusting the order
    rows arrived in: a later climate run supersedes an earlier one for the same
    day, and leaving that to an ORDER BY puts the rule far from the code that
    depends on it.
    """
    first, last = series_span(target_end_month, length)
    rows = session.scalars(
        select(DistrictClimateDay).where(
            DistrictClimateDay.admin_unit_id == admin_unit_id,
            DistrictClimateDay.variable == variable,
            DistrictClimateDay.period_date >= first,
            DistrictClimateDay.period_date <= last,
        )
    )
    by_date: dict[date, DistrictClimateDay] = {}
    for row in rows:
        current = by_date.get(row.period_date)
        if current is None or row.climate_run_id > current.climate_run_id:
            by_date[row.period_date] = row
    return [by_date[key] for key in sorted(by_date, reverse=True)]


def trailing_profiles(
    values_newest_first: tuple[float, ...], length: int
) -> tuple[tuple[float, ...], ...]:
    """One profile per day of the month, newest day first within each.

    The series runs newest first and carries ``length - 1`` lead-in days at its
    tail, so every window of ``length`` consecutive positions is one day and the
    days before it - which is exactly the row the model was fitted on. Sliding
    over the series therefore yields one profile per day of the month, in the
    same order the days appear.
    """
    if length < 1:
        raise ClimateInputError("MODEL_INPUT_CONTRACT_INVALID", f"length={length}")
    return tuple(
        values_newest_first[start : start + length]
        for start in range(len(values_newest_first) - length + 1)
    )


def build_and_persist_daily_input_window(
    session: Session,
    *,
    admin_unit_id: int,
    target_end_month: date,
    length: int,
    batch_profile: str = TRAILING_WINDOW_MEAN,
    variable: str = DAILY_VARIABLE,
) -> ClimateInputWindowRecord:
    """Select and persist the exact daily values that may be sent to a model."""

    if length < 1:
        raise ClimateInputError("MODEL_INPUT_CONTRACT_INVALID", f"length={length}")
    if batch_profile not in SUPPORTED_BATCH_PROFILES:
        raise ClimateInputError("MODEL_BATCH_PROFILE_UNSUPPORTED", batch_profile)
    if session.get(AdminUnit, admin_unit_id) is None:
        raise ClimateInputError("CLIMATE_PLACE_NOT_FOUND", str(admin_unit_id))

    ordered = _load_series(
        session,
        admin_unit_id=admin_unit_id,
        target_end_month=target_end_month,
        length=length,
        variable=variable,
    )
    # Every day of the month is scored, so every day must be present - and so
    # must the lead-in the first of the month is scored against. A gap is
    # reported rather than skipped: dropping a day would quietly change the
    # month's mean, and a month missing its hottest week is not the month.
    first, last = series_span(target_end_month, length)
    expected = (last - first).days + 1
    if len(ordered) != expected:
        present = {row.period_date for row in ordered}
        missing = [
            first + timedelta(days=offset)
            for offset in range(expected)
            if first + timedelta(days=offset) not in present
        ]
        raise ClimateInputError(
            "CLIMATE_DAILY_DATA_NOT_READY",
            f"{target_end_month:%Y-%m} needs {expected} days of {variable} "
            f"({first:%Y-%m-%d} to {last:%Y-%m-%d}); "
            f"{len(missing)} missing, first {missing[0]:%Y-%m-%d}",
        )

    # `ordered` is newest first, matching the `order` the manifests declare.
    target_end_date = ordered[0].period_date

    digest = hashlib.sha256(
        json.dumps(
            {
                "contract_version": DAILY_CONTRACT_VERSION,
                "grain": "day",
                "admin_unit_id": admin_unit_id,
                "variable": variable,
                "batch_profile": batch_profile,
                "length": length,
                "days": [
                    {
                        "date": row.period_date.isoformat(),
                        "climate_run_id": row.climate_run_id,
                        "value": row.value,
                    }
                    for row in ordered
                ],
            },
            sort_keys=True,
            separators=(",", ":"),
        ).encode()
    ).hexdigest()

    existing = session.scalar(
        select(ClimateInputWindowRecord).where(
            ClimateInputWindowRecord.input_hash == digest
        )
    )
    if existing is not None:
        return existing

    try:
        with session.begin_nested():
            stored = ClimateInputWindowRecord(
                admin_unit_id=admin_unit_id,
                target_end_month=target_end_month.replace(day=1),
                target_end_date=target_end_date,
                grain="day",
                input_hash=digest,
                contract_version=DAILY_CONTRACT_VERSION,
            )
            session.add(stored)
            session.flush()
            for lag_index, row in enumerate(ordered):
                session.add(
                    ClimateInputDayRecord(
                        climate_input_window_id=stored.id,
                        district_climate_day_id=row.id,
                        lag_index=lag_index,
                    )
                )
            session.flush()
        return stored
    except IntegrityError:
        # Another worker persisted the same immutable input while this
        # transaction was selecting it; the savepoint keeps ours usable.
        existing = session.scalar(
            select(ClimateInputWindowRecord).where(
                ClimateInputWindowRecord.input_hash == digest
            )
        )
        if existing is not None:
            return existing
        raise


def read_daily_input_values(
    session: Session, window: ClimateInputWindowRecord
) -> tuple[float, ...]:
    """The window's values, lag 0 first."""
    rows = session.scalars(
        select(ClimateInputDayRecord)
        .where(ClimateInputDayRecord.climate_input_window_id == window.id)
        .order_by(ClimateInputDayRecord.lag_index)
    )
    return tuple(row.climate_value.value for row in rows)


def read_daily_input_dates(
    session: Session, window: ClimateInputWindowRecord
) -> tuple[date, ...]:
    """The window's dates, lag 0 first, so provenance can name the days used."""
    rows = session.scalars(
        select(ClimateInputDayRecord)
        .where(ClimateInputDayRecord.climate_input_window_id == window.id)
        .order_by(ClimateInputDayRecord.lag_index)
    )
    return tuple(row.climate_value.period_date for row in rows)
