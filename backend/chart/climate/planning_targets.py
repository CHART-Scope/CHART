from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Literal

from .source_policy import (
    SEASONAL_RELEASE_DAY,
    resolve_month_source,
    seasonal_last_supported_month,
)


@dataclass(frozen=True)
class HeatSeasonCalendar:
    label: str
    start_month: int
    end_month: int
    source_name: str
    source_uri: str


@dataclass(frozen=True)
class HeatSeasonOption:
    label: str
    months: tuple[date, date, date]
    planning_date: date
    available: bool
    available_from: date | None
    unavailable_reason: str | None
    source_name: str
    source_uri: str


@dataclass(frozen=True)
class PlanningOptions:
    source_as_of: date
    custom_min_month: date
    custom_max_month: date
    next_three_months: HeatSeasonOption
    next_heat_season: HeatSeasonOption | None
    long_term_projection: LongTermProjectionOption | None


@dataclass(frozen=True)
class ProjectionScenarioOption:
    value: Literal["ssp126", "ssp370", "ssp585"]
    label: str
    description: str


@dataclass(frozen=True)
class LongTermProjectionOption:
    label: str
    period: Literal["2031-2040"]
    months: tuple[date, date, date]
    planning_date: date
    scenarios: tuple[ProjectionScenarioOption, ...]
    source_name: str
    source_uri: str


HEAT_SEASON_CALENDARS = {
    "madhya-pradesh": HeatSeasonCalendar(
        label="Hot-weather season",
        start_month=3,
        end_month=5,
        source_name="India Meteorological Department",
        source_uri=(
            "https://internal.imd.gov.in/pages/press_release_mausam.php?"
            "article_id=422421688.0"
        ),
    )
}


def planning_options_for_place(
    admin_unit_code: str,
    *,
    geography_path: str | None = None,
    now: datetime | None = None,
) -> PlanningOptions:
    current_time = now or datetime.now(timezone.utc)
    current_month = current_time.date().replace(day=1)
    calendar = HEAT_SEASON_CALENDARS.get(admin_unit_code)
    if (
        calendar is None
        and geography_path
        and geography_path.startswith("/india/madhya-pradesh/")
    ):
        calendar = HEAT_SEASON_CALENDARS["madhya-pradesh"]
    return PlanningOptions(
        source_as_of=current_time.date(),
        custom_min_month=current_month,
        custom_max_month=seasonal_last_supported_month(current_time),
        next_three_months=_next_three_months(current_time),
        next_heat_season=(
            _next_heat_season(calendar, now=current_time) if calendar else None
        ),
        long_term_projection=(_long_term_projection() if calendar else None),
    )


def _next_three_months(now: datetime) -> HeatSeasonOption:
    start = _add_months(now.date().replace(day=1), 1)
    months = (start, _add_months(start, 1), _add_months(start, 2))
    return HeatSeasonOption(
        label=f"Next 3 months ({months[0]:%b}–{months[-1]:%b %Y})",
        months=months,
        planning_date=months[-1],
        available=True,
        available_from=None,
        unavailable_reason=None,
        source_name="C3S seasonal forecast",
        source_uri=(
            "https://cds.climate.copernicus.eu/datasets/seasonal-monthly-single-levels"
        ),
    )


def _long_term_projection() -> LongTermProjectionOption:
    months = (date(2040, 3, 1), date(2040, 4, 1), date(2040, 5, 1))
    return LongTermProjectionOption(
        label="March–May average for 2031–2040",
        period="2031-2040",
        months=months,
        planning_date=months[-1],
        scenarios=(
            ProjectionScenarioOption(
                value="ssp126",
                label="Lower emissions (SSP1-2.6)",
                description="A future with strong emissions reductions.",
            ),
            ProjectionScenarioOption(
                value="ssp370",
                label="High emissions (SSP3-7.0)",
                description="A future with high emissions and limited cooperation.",
            ),
            ProjectionScenarioOption(
                value="ssp585",
                label="Very high emissions (SSP5-8.5)",
                description="A fossil-fuel-intensive future with very high emissions.",
            ),
        ),
        source_name="ISIMIP3b bias-adjusted climate projections",
        source_uri="https://doi.org/10.48364/ISIMIP.842396.1",
    )


def _next_heat_season(
    calendar: HeatSeasonCalendar,
    *,
    now: datetime,
) -> HeatSeasonOption:
    year = now.year
    end_of_this_season = date(year, calendar.end_month, 1)
    if now.date().replace(day=1) > end_of_this_season:
        year += 1

    months = tuple(
        date(year, month, 1)
        for month in range(calendar.start_month, calendar.end_month + 1)
    )
    if len(months) != 3:
        raise ValueError("HEAT_SEASON_MUST_MATCH_THREE_MONTH_MODEL_WINDOW")
    available = all(
        resolve_month_source(month, now=now).source_class is not None
        for month in months
    )
    planning_date = months[-1]
    return HeatSeasonOption(
        label=f"{calendar.label} ({months[0]:%b}–{months[-1]:%b %Y})",
        months=months,  # type: ignore[arg-type]
        planning_date=planning_date,
        available=available,
        available_from=(None if available else _seasonal_available_from(planning_date)),
        unavailable_reason=(None if available else "CLIMATE_HORIZON_NOT_AVAILABLE"),
        source_name=calendar.source_name,
        source_uri=calendar.source_uri,
    )


def _seasonal_available_from(planning_date: date) -> date:
    issue_month = _add_months(planning_date, -5)
    return date(issue_month.year, issue_month.month, SEASONAL_RELEASE_DAY)


def _add_months(value: date, count: int) -> date:
    zero_based = value.year * 12 + value.month - 1 + count
    year, month_index = divmod(zero_based, 12)
    return date(year, month_index + 1, 1)
