"""Request and response shapes for saved plans."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from chart.heat_outlook.schemas import Ratio

Code = Field(default=None, max_length=32, pattern=r"^[A-Za-z0-9_.-]+$")
OutcomeCode = Field(pattern=r"^[a-z0-9_]{1,64}$")
PlanStatus = Literal["draft", "saved"]


class PlanChoices(BaseModel):
    """The dashboard selections that reopen a saved view."""

    view: Literal["observed", "projection"]
    month: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}$")
    scenario: str | None = Code
    period: str | None = Code
    selector: str | None = Code
    observed_selector: str | None = Code
    reference: Literal["annual", "season", "peak"] = "annual"


def _plan_name(value: str | None) -> str | None:
    if value is None:
        return None
    value = " ".join(value.split())
    if not value:
        raise ValueError("A plan needs a name.")
    return value


class SavedPlanCreate(BaseModel):
    """A dashboard view to save, or the first step of the Configure plan wizard.

    The wizard sends ``status: draft`` with the plan's dates; the dashboard
    view it was opened from is captured as for any saved view (a projection
    when no choices are sent).
    """

    name: str = Field(min_length=1, max_length=120)
    geography_id: str = Field(min_length=1, max_length=128)
    admin_unit_id: str | None = Field(default=None, max_length=128)
    outcome: str = OutcomeCode
    choices: PlanChoices = PlanChoices(view="projection")
    status: PlanStatus = "saved"
    start_date: date | None = None
    end_date: date | None = None

    _named = field_validator("name")(_plan_name)


class SavedPlanUpdate(BaseModel):
    """A wizard step's changes; fields left out keep their saved values."""

    name: str | None = Field(default=None, min_length=1, max_length=120)
    start_date: date | None = None
    end_date: date | None = None
    hazard: str | None = Field(default=None, pattern=r"^[a-z0-9_]{1,64}$")
    outcomes: list[str] | None = Field(default=None, min_length=1, max_length=8)
    #: Saving a draft (the wizard's last step) makes it a saved plan.
    status: Literal["saved"] | None = None

    _named = field_validator("name")(_plan_name)

    @model_validator(mode="after")
    def _changes_something(self) -> "SavedPlanUpdate":
        if not self.model_fields_set:
            raise ValueError("Send at least one field to change.")
        # Only the dates can be cleared, and only together (checked on save).
        if any(
            getattr(self, field) is None
            for field in self.model_fields_set - {"start_date", "end_date"}
        ):
            raise ValueError("Only the timeline can be cleared.")
        return self


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
    status: PlanStatus
    geography_id: str
    admin_unit_id: str | None
    outcome: str
    hazard: str
    outcomes: list[str]
    start_date: date | None
    end_date: date | None
    choices: PlanChoices
    figure: PlanFigure
    signals: PlanSignals
    created_at: datetime
    updated_at: datetime


class SavedPlanList(BaseModel):
    items: list[SavedPlanResponse]


class PlanDistrictArea(BaseModel):
    """One district beneath the plan's place, ranked by its attributable share."""

    geography_id: str
    name: str
    level: str
    value_percent: float | None
    #: Why there is no share, as the map says it ("no_model", ...).
    missing_reason: str | None
    #: 1 for the highest share; None without a share.
    rank: int | None
    #: At or above the elevated band (5%), as the action repository's
    #: priority areas.
    suggested: bool
    selected: bool


class PlanDistricts(BaseModel):
    """Step 3 of the Configure plan wizard: the ranking and the plan's choice.

    ``source``: ``projection`` when the published outlook covers the place
    (each district's annual-average share), else ``observed`` (the risk map's
    latest result for each district; ``month`` when the map names one). Until
    the plan's districts are saved (``saved: false``), the suggested ones are
    selected, with the district the plan was opened on from the dashboard.
    """

    plan_id: str
    outcome: str
    source: Literal["projection", "observed"]
    month: str | None
    saved: bool
    areas: list[PlanDistrictArea]


class PlanDistrictsUpdate(BaseModel):
    geography_ids: list[str] = Field(min_length=1, max_length=1000)


class PlanActionItem(BaseModel):
    """One heat action from the action repository, ranked for the plan."""

    id: str
    title: str
    summary: str
    seasons: list[Literal["before", "during", "after"]]
    #: The departments the repository names for it, as written there.
    departments: list[str]
    cost_level: str | None
    #: Why it ranks where it does, in the rules' order.
    reasons: list[str]
    rank: int
    #: Its season falls inside the plan's dates.
    recommended: bool
    selected: bool
    owner_department_id: int | None
    due_date: date | None


class PlanDepartment(BaseModel):
    id: int
    name: str


class PlanActions(BaseModel):
    """Step 4 of the Configure plan wizard: actions ranked for the plan.

    Ranked by the recommendation rules: an action whose season falls inside
    the plan's dates (on the place's heat-season calendar) scores 4, one that
    targets an outcome the plan addresses 3, and unless heat risk is clearly
    raised a cheaper one 2 (low or no cost) or 1 (medium); ties keep the
    repository's order. Until the plan's actions are saved (``saved:
    false``), the recommended ones are selected.
    """

    plan_id: str
    phases: list[Literal["before", "during", "after"]]
    saved: bool
    items: list[PlanActionItem]
    #: Owners to choose from: the active departments of the plan's country.
    departments: list[PlanDepartment]
    #: The plan's chosen districts that were suggested (5% or more).
    priority_districts: list[str]


class PlanActionChoice(BaseModel):
    action_id: str = Field(min_length=1, max_length=64)
    owner_department_id: int | None = None
    due_date: date | None = None


class PlanActionsUpdate(BaseModel):
    items: list[PlanActionChoice] = Field(min_length=1, max_length=200)
