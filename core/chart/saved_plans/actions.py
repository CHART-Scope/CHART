"""The actions a plan includes (Configure plan, step 4).

Candidates are the action repository's actions for the plan's hazard in its
country, ranked by the recommendation rules (chart.recommendations) read
against the plan itself: an action fits when one of its seasons falls inside
the plan's dates on the place's heat-season calendar. Saving keeps each
chosen action's title, seasons and cost as the feed had them, its owner
department and due date.
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from chart.actions.feed import list_actions
from chart.actions.schemas import ActionContent
from chart.auth.schemas import CurrentUserContext
from chart.heat_seasons.service import calendar_months
from chart.shared.db.models import (
    AppGeography,
    Department,
    PlanAction,
    PlanDistrict,
    SavedPlan,
)

from .schemas import (
    PlanActionItem,
    PlanActions,
    PlanActionsUpdate,
    PlanDepartment,
)
from .service import SavedPlanError, plan_response, readable_plan, require_plan_write

Phase = Literal["before", "during", "after"]
PHASES: tuple[Phase, ...] = ("before", "during", "after")
PHASE_LETTERS: dict[str, Phase] = {"b": "before", "d": "during", "a": "after"}
PHASE_NAMES = {
    "before": "before the heat season",
    "during": "during the heat season",
    "after": "after the heat season",
}
# Plan hazard code -> the feed's "Hazard" value for it.
HAZARD_TAGS = {"extreme_heat": "Extreme heat"}
# Plan outcome code -> the feed's "Health outcome" value for it.
OUTCOME_TAGS = {"lbw": "Low birth weight", "under_5_mortality": "Under-5 mortality"}
COST_SCORE = {"No additional cost": 2, "Low": 2, "Medium": 1}


def read_actions(
    session: Session, user: CurrentUserContext, plan_id: str
) -> PlanActions:
    plan = readable_plan(session, user, plan_id)
    return _actions(session, plan)


def save_actions(
    session: Session,
    user: CurrentUserContext,
    plan_id: str,
    request: PlanActionsUpdate,
) -> PlanActions:
    plan = readable_plan(session, user, plan_id)
    require_plan_write(session, user, plan)
    ranked = {item.id: item for item in _ranking(session, plan)[1]}
    owners = {department.id for department in _departments(session, plan)}
    choices = {choice.action_id: choice for choice in request.items}
    for choice in choices.values():
        if choice.action_id not in ranked:
            raise SavedPlanError("PLAN_ACTION_INVALID", 422)
        if (
            choice.owner_department_id is not None
            and choice.owner_department_id not in owners
        ):
            raise SavedPlanError("PLAN_ACTION_OWNER_INVALID", 422)
        if choice.due_date is not None and not _within(plan, choice.due_date):
            raise SavedPlanError("PLAN_ACTION_DUE_INVALID", 422)
    session.execute(delete(PlanAction).where(PlanAction.plan_id == plan.id))
    session.add_all(
        PlanAction(
            plan_id=plan.id,
            action_id=choice.action_id,
            title=ranked[choice.action_id].title,
            seasons=list(ranked[choice.action_id].seasons),
            cost_level=ranked[choice.action_id].cost_level,
            rank=ranked[choice.action_id].rank,
            owner_department_id=choice.owner_department_id,
            due_date=choice.due_date,
        )
        for choice in choices.values()
    )
    session.commit()
    return _actions(session, plan)


def _actions(session: Session, plan: SavedPlan) -> PlanActions:
    phases, ranked = _ranking(session, plan)
    saved = {
        row.action_id: row
        for row in session.scalars(
            select(PlanAction).where(PlanAction.plan_id == plan.id)
        )
    }
    items = [
        item.model_copy(
            update={
                "selected": item.id in saved if saved else item.recommended,
                "owner_department_id": (
                    saved[item.id].owner_department_id if item.id in saved else None
                ),
                "due_date": saved[item.id].due_date if item.id in saved else None,
            }
        )
        for item in ranked
    ]
    priority = session.scalars(
        select(AppGeography.name)
        .join(PlanDistrict, PlanDistrict.geography_id == AppGeography.id)
        .where(PlanDistrict.plan_id == plan.id, PlanDistrict.suggested.is_(True))
        .order_by(PlanDistrict.rank)
    ).all()
    return PlanActions(
        plan_id=plan.id,
        phases=phases,
        saved=bool(saved),
        items=items,
        departments=_departments(session, plan),
        priority_districts=list(priority),
    )


def _ranking(
    session: Session, plan: SavedPlan
) -> tuple[list[Phase], list[PlanActionItem]]:
    place = session.get(AppGeography, plan.admin_unit_id or plan.geography_id)
    assert place is not None  # readable_plan refused a plan whose place is gone
    phases = _phases(session, plan)
    hazard = HAZARD_TAGS.get(plan.hazard)
    outcomes = {OUTCOME_TAGS[code] for code in plan.outcomes if code in OUTCOME_TAGS}
    risk = plan_response(plan).signals.risk_level
    candidates = [
        action
        for action in list_actions(place.country_code).items
        if hazard in action.hazards
    ]
    scored = []
    for order, action in enumerate(candidates):
        reasons, score = [], 0
        fitting = [
            phase for phase in PHASES if phase in action.seasons and phase in phases
        ]
        if fitting:
            score += 4
            reasons.append(
                "Fits "
                + " and ".join(PHASE_NAMES[phase] for phase in fitting)
                + ", inside the plan's dates."
            )
        targeted = sorted(outcomes & set(action.health_outcomes))
        if targeted:
            score += 3
            reasons.append(f"Targets {', '.join(t.lower() for t in targeted)}.")
        if risk != "elevated" and action.cost_level in COST_SCORE:
            score += COST_SCORE[action.cost_level]
            if COST_SCORE[action.cost_level] == 2:
                reasons.append("Low cost.")
        scored.append((action, reasons, score, order, bool(fitting)))
    scored.sort(key=lambda row: (-row[2], row[3]))
    return phases, [
        _item(action, reasons, rank, fits)
        for rank, (action, reasons, _score, _order, fits) in enumerate(scored, 1)
    ]


def _item(
    action: ActionContent, reasons: list[str], rank: int, recommended: bool
) -> PlanActionItem:
    return PlanActionItem(
        id=action.id,
        title=action.title,
        summary=action.summary,
        seasons=[season for season in PHASES if season in action.seasons],
        departments=action.departments,
        cost_level=action.cost_level,
        reasons=reasons,
        rank=rank,
        recommended=recommended,
        selected=False,
        owner_department_id=None,
        due_date=None,
    )


def _phases(session: Session, plan: SavedPlan) -> list[Phase]:
    """The heat-season phases the plan's months fall in, in season order."""

    if plan.start_date is None or plan.end_date is None:
        return [plan_response(plan).signals.timing]
    calendar = calendar_months(session, plan.admin_unit_id or plan.geography_id)
    if not calendar:
        return list(PHASES)
    covered: set[Phase] = set()
    year, month = plan.start_date.year, plan.start_date.month
    while (year, month) <= (plan.end_date.year, plan.end_date.month):
        phase = PHASE_LETTERS.get(calendar[month - 1])
        if phase:
            covered.add(phase)
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return [phase for phase in PHASES if phase in covered]


def _departments(session: Session, plan: SavedPlan) -> list[PlanDepartment]:
    place = session.get(AppGeography, plan.geography_id)
    assert place is not None
    return [
        PlanDepartment(id=row.id, name=row.name)
        for row in session.scalars(
            select(Department)
            .where(
                Department.country_code == place.country_code,
                Department.archived_at.is_(None),
            )
            .order_by(Department.name)
        )
    ]


def _within(plan: SavedPlan, day: date) -> bool:
    if plan.start_date is None or plan.end_date is None:
        return True
    return plan.start_date <= day <= plan.end_date
