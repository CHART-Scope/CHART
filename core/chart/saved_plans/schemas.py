"""Request and response shapes for saved plans."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from chart.heat_outlook.schemas import Ratio

Code = Field(default=None, max_length=32, pattern=r"^[A-Za-z0-9_.-]+$")


class PlanChoices(BaseModel):
    """The dashboard selections that reopen a saved view."""

    view: Literal["observed", "projection"]
    month: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}$")
    scenario: str | None = Code
    period: str | None = Code
    selector: str | None = Code
    observed_selector: str | None = Code
    reference: Literal["annual", "peak"] = "annual"


class SavedPlanCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    geography_id: str = Field(min_length=1, max_length=128)
    admin_unit_id: str | None = Field(default=None, max_length=128)
    outcome: str = Field(pattern=r"^[a-z0-9_]{1,64}$")
    choices: PlanChoices

    @field_validator("name")
    @classmethod
    def _named(cls, value: str) -> str:
        value = " ".join(value.split())
        if not value:
            raise ValueError("A plan needs a name.")
        return value


class PlanFigure(BaseModel):
    """The published estimate for a plan's choices when it was saved."""

    status: Literal["captured", "unavailable"]
    reason: str | None = None
    place: str | None = None
    release: str | None = None
    when: str | None = None
    selector_label: str | None = None
    percent: float | None = None
    low_percent: float | None = None
    high_percent: float | None = None
    ratio: Ratio | None = None
    heat_season_label: str | None = None
    heat_season_months: list[int] = []


class PlanSignals(BaseModel):
    """Deterministic reading of the figure that recommendations are keyed on.

    ``risk_level``: ``elevated`` when the ratio's 95% CI lies above 1,
    ``possible`` when only the central estimate does (or a share is reported
    without a ratio), ``not_detected`` when the central ratio is at or below 1,
    ``unknown`` without a figure. ``timing``: a projection plans ahead of the
    heat season; an observed month inside the official season is ``during``,
    up to two months after it ``after``, otherwise ``before``.
    """

    risk_level: Literal["elevated", "possible", "not_detected", "unknown"]
    timing: Literal["before", "during", "after"]


class SavedPlanResponse(BaseModel):
    id: str
    name: str
    geography_id: str
    admin_unit_id: str | None
    outcome: str
    choices: PlanChoices
    figure: PlanFigure
    signals: PlanSignals
    created_at: datetime


class SavedPlanList(BaseModel):
    items: list[SavedPlanResponse]
