from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Literal

from .data_contract import ClimateSourceClass

CLIMATE_SOURCE_POLICY_VERSION = "monthly-planning-v2-projection"
SEASONAL_RELEASE_DAY = 7
SEASONAL_LEAD_MONTHS = 6
NEAR_TERM_DAYS = 15

UnavailableReason = Literal[
    "CLIMATE_LONG_TERM_SCENARIO_REQUIRED",
    "CLIMATE_PROJECTION_CHOICE_INVALID",
]

APPROVED_PROJECTION_SCENARIOS = {"ssp126", "ssp370", "ssp585"}
APPROVED_PROJECTION_PERIODS = {"2031-2040": (2031, 2040)}
PROJECTION_SEASON_MONTHS = (3, 4, 5)


@dataclass(frozen=True)
class MonthSourceDecision:
    """The only climate source class allowed for one monthly model value."""

    period_month: date
    source_class: ClimateSourceClass | None
    source_name: str
    policy_version: str = CLIMATE_SOURCE_POLICY_VERSION
    unavailable_reason: UnavailableReason | None = None


def resolve_month_source(
    period_month: date,
    *,
    now: datetime | None = None,
    projection_scenario: str | None = None,
    projection_period: str | None = None,
) -> MonthSourceDecision:
    """Route completed months to ERA5 and supported future months to C3S.

    The LBW input is a complete calendar-month value. The separate 0-15 day
    weather feed cannot replace that value until a reviewed full-month blending
    method exists.
    """

    month = period_month.replace(day=1)
    current_time = now or datetime.now(timezone.utc)
    current_month = current_time.date().replace(day=1)

    if projection_scenario is not None or projection_period is not None:
        years = APPROVED_PROJECTION_PERIODS.get(projection_period or "")
        if projection_scenario not in APPROVED_PROJECTION_SCENARIOS or years is None:
            return MonthSourceDecision(
                period_month=month,
                source_class=None,
                source_name="Choose an approved long-term scenario and period",
                unavailable_reason="CLIMATE_PROJECTION_CHOICE_INVALID",
            )
        expected = {date(years[1], value, 1) for value in PROJECTION_SEASON_MONTHS}
        if month not in expected:
            return MonthSourceDecision(
                period_month=month,
                source_class=None,
                source_name="Long-term input is only prepared for March–May",
                unavailable_reason="CLIMATE_PROJECTION_CHOICE_INVALID",
            )
        return MonthSourceDecision(
            period_month=month,
            source_class="projection",
            source_name=(
                "ISIMIP3b bias-adjusted projection "
                f"({projection_scenario}; {years[0]}–{years[1]} average)"
            ),
        )

    if month < current_month:
        return MonthSourceDecision(
            period_month=month,
            source_class="observed",
            source_name="ERA5 historical data",
        )

    if month <= seasonal_last_supported_month(current_time):
        return MonthSourceDecision(
            period_month=month,
            source_class="seasonal",
            source_name="C3S seasonal forecast",
        )

    return MonthSourceDecision(
        period_month=month,
        source_class=None,
        source_name="Not available without a long-term scenario",
        unavailable_reason="CLIMATE_LONG_TERM_SCENARIO_REQUIRED",
    )


def latest_seasonal_issue_month(now: datetime | None = None) -> date:
    """Return the newest C3S issue expected to be published."""

    current = (now or datetime.now(timezone.utc)).date()
    current_month = current.replace(day=1)
    if current.day >= SEASONAL_RELEASE_DAY:
        return current_month
    return _add_months(current_month, -1)


def seasonal_last_supported_month(now: datetime | None = None) -> date:
    return _add_months(
        latest_seasonal_issue_month(now),
        SEASONAL_LEAD_MONTHS - 1,
    )


def seasonal_issue_covers(issue_time: datetime | None, period_month: date) -> bool:
    if issue_time is None:
        return False
    issue_month = issue_time.date().replace(day=1)
    lead = _month_distance(issue_month, period_month.replace(day=1)) + 1
    return 1 <= lead <= SEASONAL_LEAD_MONTHS


def _add_months(value: date, count: int) -> date:
    zero_based = value.year * 12 + value.month - 1 + count
    year, month_index = divmod(zero_based, 12)
    return date(year, month_index + 1, 1)


def _month_distance(start: date, end: date) -> int:
    return (end.year - start.year) * 12 + end.month - start.month
