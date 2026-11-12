"""Save, list and remove the dashboard views a user plans from.

A plan stores the selections that reopen its view and the estimate the
published model gave for them at save time, read through the same outlook
service as the dashboard so the two always agree.
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import Any, Literal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from chart.heat_seasons.service import season_months
from chart.auth.schemas import CurrentUserContext
from chart.auth.service import can_read_geography_path
from chart.climate.heat_seasons import heat_season
from chart.heat_outlook.observed import ObservedNotCalibrated, load_observed
from chart.heat_outlook.service import (
    OutlookNotAvailable,
    OutlookSelectionInvalid,
    ViewTurnedOff,
    legacy_observed_geography,
    load_outlook,
)
from chart.model_settings.service import _ensure_user, outlook_restriction
from chart.shared.db.models import AppGeography, SavedPlan

from .schemas import (
    PlanChoices,
    PlanFigure,
    PlanSignals,
    SavedPlanCreate,
    SavedPlanResponse,
)

RiskLevel = Literal["elevated", "possible", "not_detected", "unknown"]
PlanTiming = Literal["before", "during", "after"]
MAX_PLANS_PER_USER = 100


class SavedPlanError(ValueError):
    def __init__(self, code: str, status_code: int) -> None:
        super().__init__(code)
        self.code = code
        self.status_code = status_code


def create_plan(
    session: Session, user: CurrentUserContext, request: SavedPlanCreate
) -> SavedPlanResponse:
    frame = session.get(AppGeography, request.geography_id)
    if frame is None:
        raise SavedPlanError("GEOGRAPHY_NOT_FOUND", 404)
    place = frame
    if request.admin_unit_id:
        unit = session.get(AppGeography, request.admin_unit_id)
        # A sub-area must sit inside the frame it was chosen on.
        if unit is None or not unit.path.startswith(frame.path.rstrip("/") + "/"):
            raise SavedPlanError("PLAN_AREA_INVALID", 422)
        place = unit
    if not can_read_geography_path(user, place.path):
        raise SavedPlanError("GEOGRAPHY_OUT_OF_SCOPE", 403)
    count = (
        session.scalar(select(func.count()).where(SavedPlan.user_id == user.user_id))
        or 0
    )
    if count >= MAX_PLANS_PER_USER:
        raise SavedPlanError("SAVED_PLAN_LIMIT", 409)

    try:
        choices, figure = capture_figure(
            session, place, request.outcome, request.choices
        )
    except OutlookSelectionInvalid as exc:
        raise SavedPlanError("OUTLOOK_SELECTION_INVALID", 422) from exc

    _ensure_user(session, user)
    record = SavedPlan(
        id=str(uuid.uuid4()),
        user_id=user.user_id,
        name=request.name,
        geography_id=frame.id,
        admin_unit_id=place.id if place is not frame else None,
        outcome=request.outcome,
        choices=choices.model_dump(),
        figure=figure.model_dump(),
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return plan_response(record)


def list_plans(session: Session, user: CurrentUserContext) -> list[SavedPlanResponse]:
    """The user's own plans for places they can still read, newest first."""

    plans = session.scalars(
        select(SavedPlan)
        .where(SavedPlan.user_id == user.user_id)
        .order_by(SavedPlan.created_at.desc())
    ).all()
    place_ids = {plan.admin_unit_id or plan.geography_id for plan in plans}
    paths: dict[str, str] = {
        row.id: row.path
        for row in session.execute(
            select(AppGeography.id, AppGeography.path).where(
                AppGeography.id.in_(place_ids)
            )
        )
    }
    return [
        plan_response(plan)
        for plan in plans
        if can_read_geography_path(user, paths[plan.admin_unit_id or plan.geography_id])
    ]


def get_plan(
    session: Session, user: CurrentUserContext, plan_id: str
) -> SavedPlanResponse:
    return plan_response(readable_plan(session, user, plan_id))


def readable_plan(
    session: Session, user: CurrentUserContext, plan_id: str
) -> SavedPlan:
    """The user's own plan, refused once its place has left their scope."""

    plan = _owned(session, user, plan_id)
    place = session.get(AppGeography, plan.admin_unit_id or plan.geography_id)
    if place is None or not can_read_geography_path(user, place.path):
        raise SavedPlanError("GEOGRAPHY_OUT_OF_SCOPE", 403)
    return plan


def delete_plan(session: Session, user: CurrentUserContext, plan_id: str) -> None:
    session.delete(_owned(session, user, plan_id))
    session.commit()


def _owned(session: Session, user: CurrentUserContext, plan_id: str) -> SavedPlan:
    plan = session.get(SavedPlan, plan_id)
    # Another user's plan is reported as missing, never as forbidden.
    if plan is None or plan.user_id != user.user_id:
        raise SavedPlanError("SAVED_PLAN_NOT_FOUND", 404)
    return plan


def capture_figure(
    session: Session, place: AppGeography, outcome: str, choices: PlanChoices
) -> tuple[PlanChoices, PlanFigure]:
    """Resolve the choices and read the estimate the dashboard shows for them."""

    season = heat_season(place.country_code)
    seasonal: dict[str, Any] = {
        "heat_season_label": season.label if season else None,
        "heat_season_months": list(season.months) if season else [],
    }
    restriction = outlook_restriction(outcome, country_code=place.country_code)
    try:
        if choices.view == "projection":
            outlook = load_outlook(
                place.id,
                outcome,
                scenario=choices.scenario,
                period=choices.period,
                selector=choices.selector,
                restriction=restriction,
                season_months=season_months(session, place.id),
            )
            resolved = choices.model_copy(
                update={
                    "scenario": outlook.scenario,
                    "period": outlook.period,
                    "selector": outlook.selector,
                }
            )
            return resolved, _projected_figure(outlook, choices.reference, seasonal)
        if not legacy_observed_geography(session, place.id, outcome):
            return choices, _unavailable(
                "Observed estimates for this place are not captured in saved plans "
                "yet; reopen the plan to see them.",
                seasonal,
            )
        observed = load_observed(
            session,
            place.id,
            outcome,
            month=choices.month,
            selector=choices.observed_selector,
            restriction=restriction,
        )
    except ViewTurnedOff:
        return choices, _unavailable(
            "This view is switched off in the model settings.", seasonal
        )
    except (OutlookNotAvailable, ObservedNotCalibrated, FileNotFoundError):
        return choices, _unavailable(
            "No published estimate covers this place and outcome.", seasonal
        )
    resolved = choices.model_copy(
        update={"month": observed.month, "observed_selector": observed.selector}
    )
    estimate = observed.estimate
    if estimate is None or observed.month is None:
        return resolved, _unavailable(
            "No month has enough ERA5 data for an estimate yet.", seasonal
        )
    return resolved, PlanFigure(
        status="captured",
        reason=estimate.message if estimate.value_percent is None else None,
        place=observed.place,
        release=observed.release,
        when=_month_label(observed.month),
        selector_label=_label(observed.selectors, observed.selector),
        percent=estimate.value_percent,
        low_percent=estimate.low_percent,
        high_percent=estimate.high_percent,
        ratio=estimate.ratio,
        **seasonal,
    )


def _projected_figure(outlook, reference: str, seasonal: dict) -> PlanFigure:
    period = _label(outlook.periods, outlook.period)
    scenario = _label(outlook.scenarios, outlook.scenario)
    common = {
        "status": "captured",
        "place": outlook.place,
        "release": outlook.release,
        "selector_label": _label(outlook.selectors, outlook.selector),
        **seasonal,
    }
    peak, when = None, ""
    if reference == "season":
        peak, when = outlook.heat_season_share, "the peak heat season"
    elif reference == "peak" and outlook.peak_season:
        peak = outlook.peak_season
        when = f"the highest-risk months ({peak.label})"
    if peak:
        return PlanFigure(
            **common,
            when=f"{when} of {period} under {scenario}",
            percent=peak.part.value_percent,
            low_percent=peak.part.low_percent,
            high_percent=peak.part.high_percent,
            reason=peak.part.message,
        )
    row = next(
        (item for item in outlook.period_summary if item.period == outlook.period),
        None,
    )
    heat = next((p for p in row.parts if p.side == "heat"), None) if row else None
    return PlanFigure(
        **common,
        when=f"an average year of {period} under {scenario}",
        percent=heat.value_percent if heat else None,
        low_percent=heat.low_percent if heat else None,
        high_percent=heat.high_percent if heat else None,
        ratio=heat.ratio if heat else None,
        reason=(heat.message if heat else "No annual summary is reported."),
    )


def _unavailable(reason: str, seasonal: dict) -> PlanFigure:
    return PlanFigure(status="unavailable", reason=reason, **seasonal)


def signals(choices: PlanChoices, figure: PlanFigure) -> PlanSignals:
    risk: RiskLevel
    ratio = figure.ratio
    if ratio is not None:
        risk = (
            "elevated"
            if ratio.low > 1
            else "possible" if ratio.value > 1 else "not_detected"
        )
    elif figure.percent is not None:
        risk = "possible" if figure.percent > 0 else "not_detected"
    else:
        risk = "unknown"
    return PlanSignals(risk_level=risk, timing=_timing(choices, figure))


def _timing(choices: PlanChoices, figure: PlanFigure) -> PlanTiming:
    months = figure.heat_season_months
    if choices.view == "projection" or not choices.month or not months:
        return "before"
    month = int(choices.month[5:7])
    if month in months:
        return "during"
    # Seasons may wrap the year end (Kenya: December to March).
    last = months[-1]
    after = {(last + offset - 1) % 12 + 1 for offset in (1, 2)}
    return "after" if month in after else "before"


def plan_response(plan: SavedPlan) -> SavedPlanResponse:
    choices = PlanChoices.model_validate(plan.choices)
    figure = PlanFigure.model_validate(plan.figure)
    return SavedPlanResponse(
        id=plan.id,
        name=plan.name,
        geography_id=plan.geography_id,
        admin_unit_id=plan.admin_unit_id,
        outcome=plan.outcome,
        choices=choices,
        figure=figure,
        signals=signals(choices, figure),
        created_at=plan.created_at,
    )


def _label(options, code: str | None) -> str | None:
    return next((option.label for option in options if option.code == code), code)


def _month_label(month: str) -> str:
    return date.fromisoformat(f"{month}-01").strftime("%B %Y")
