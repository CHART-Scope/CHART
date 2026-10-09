"""Response shapes for the Kenya heat outlook."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class Option(BaseModel):
    code: str
    label: str
    exploratory: bool = False


class OddsRatio(BaseModel):
    value: float
    low: float
    high: float
    at_tmax_c: float


class MonthPart(BaseModel):
    side: Literal["heat", "cool"]
    value_percent: float | None
    low_percent: float | None
    high_percent: float | None
    message: str | None = None


class OutlookMonth(BaseModel):
    month: int
    tmax_c: float | None
    parts: list[MonthPart]
    odds_ratio: OddsRatio | None = None


class Ratio(BaseModel):
    """The ratio behind a period's attributable share, with its 95% CI.

    Converted from the modeller's share and its CI bounds (a monotonic
    transform, so the bounds stay bounds): LBW reports an odds ratio, under-five
    a risk ratio. Shown even when the share is suppressed, as the guides ask.
    """

    kind: Literal["odds_ratio", "risk_ratio"]
    value: float
    low: float
    high: float
    precision: Literal["high", "moderate", "low"]


class PeriodPart(MonthPart):
    gcm_min_percent: float | None
    gcm_max_percent: float | None
    change_pp: float | None
    change_low_pp: float | None
    change_high_pp: float | None
    share_above_p99_percent: float | None
    thin_data: bool
    ratio: Ratio | None = None


class OutlookPeriod(BaseModel):
    period: str
    label: str
    is_baseline: bool
    parts: list[PeriodPart]


class HeatOutlookResponse(BaseModel):
    geography_id: str
    place: str
    level: Literal["county", "country"]
    outcome: str
    release: str
    source_uri: str
    baseline_period: str
    reference_note: str
    scenarios: list[Option]
    periods: list[Option]
    selectors: list[Option]
    scenario: str
    period: str
    selector: str
    selector_note: str | None
    months: list[OutlookMonth]
    period_summary: list[OutlookPeriod]
