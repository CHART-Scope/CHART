"""Change in hot days: recent years against the 1982-2011 baseline.

Pure functions (no database). The method follows the ETCCDI percentile
indices (TX90p, TX95p): an area's threshold for a calendar day is the given
percentile of its daily maximum temperatures on that day and the two days
either side, over every baseline year; a hot day is one above its day's
threshold. The indicator is the mean yearly count over the recent years minus
the mean yearly count over the baseline years, in days per year.

Thresholds come from each area's own climate, so "hot" is relative to what is
normal there. Feb 29 shares Feb 28's threshold. A year counts only when it is
complete enough (``MIN_DAYS_PER_YEAR``), and an area needs most of both periods
(``MIN_BASELINE_YEARS``, ``MIN_RECENT_YEARS``); otherwise it gets no value,
never one from a shorter record.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date

import numpy as np

BASELINE_YEARS = range(1982, 2012)
RECENT_YEARS = range(2015, 2025)
WINDOW_DAYS = 2
MIN_DAYS_PER_YEAR = 360
MIN_BASELINE_YEARS = 25
MIN_RECENT_YEARS = 8


def _day_key(day: date) -> tuple[int, int]:
    return (2, 28) if (day.month, day.day) == (2, 29) else (day.month, day.day)


def _complete_years(daily: dict[date, float], years: range) -> list[int]:
    counts: dict[int, int] = defaultdict(int)
    for day in daily:
        counts[day.year] += 1
    return [year for year in years if counts.get(year, 0) >= MIN_DAYS_PER_YEAR]


def calendar_thresholds(
    daily: dict[date, float], years: list[int], percentile: float
) -> dict[tuple[int, int], float]:
    """Each calendar day's threshold from a 5-day window over ``years``."""

    by_key: dict[tuple[int, int], list[float]] = defaultdict(list)
    ordinal = {day.toordinal(): value for day, value in daily.items()}
    wanted = set(years)
    for day in daily:
        if day.year not in wanted:
            continue
        centre = day.toordinal()
        key = _day_key(day)
        for offset in range(-WINDOW_DAYS, WINDOW_DAYS + 1):
            value = ordinal.get(centre + offset)
            if value is not None:
                by_key[key].append(value)
    return {
        key: float(np.percentile(values, percentile)) for key, values in by_key.items()
    }


def hot_days_change(daily: dict[date, float], percentile: float) -> dict | None:
    """Mean yearly hot days, recent minus baseline; None if either is too thin."""

    baseline = _complete_years(daily, BASELINE_YEARS)
    recent = _complete_years(daily, RECENT_YEARS)
    if len(baseline) < MIN_BASELINE_YEARS or len(recent) < MIN_RECENT_YEARS:
        return None
    thresholds = calendar_thresholds(daily, baseline, percentile)
    counts: dict[int, int] = defaultdict(int)
    for day, value in daily.items():
        threshold = thresholds.get(_day_key(day))
        if threshold is not None and value > threshold:
            counts[day.year] += 1
    baseline_mean = sum(counts[year] for year in baseline) / len(baseline)
    recent_mean = sum(counts[year] for year in recent) / len(recent)
    return {
        "value": round(recent_mean - baseline_mean, 2),
        "baseline_days_per_year": round(baseline_mean, 2),
        "recent_days_per_year": round(recent_mean, 2),
        "baseline_years": len(baseline),
        "recent_years": len(recent),
    }
