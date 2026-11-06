"""Rank published actions for a saved plan and write the insight beside them.

The candidates are the heat actions in the action feed for the plan's
country. The rules ranking is deterministic and always available: an action
that fits the plan's season scores most, then one that targets the plan's
outcome, then (unless heat risk is clearly raised) a cheaper one; ties keep
feed order. A configured classifier replaces only the order; if it fails the
rules order is used and the response says so. The insight is a template unless an administrator chose
a language model, and falls back to the template on any provider failure. The
figures and ranking never depend on the insight.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from chart.actions.feed import list_actions
from chart.actions.schemas import ActionContent
from chart.auth.schemas import CurrentUserContext
from chart.model_registry.routes import outcome_label
from chart.model_settings.service import _ensure_user
from chart.saved_plans.service import plan_response, readable_plan
from chart.saved_plans.schemas import SavedPlanResponse
from chart.shared.db.models import AppGeography, AuditEventRecord, RecommendationSetting

from . import providers
from .schemas import (
    Insight,
    ProviderModels,
    ProviderOption,
    RankedAction,
    RecommendationRequest,
    RecommendationResponse,
    RecommendationSettings,
    RecommendationSettingsResponse,
)

logger = logging.getLogger(__name__)

SETTING_ID = 1
AUDIT_EVENT_TYPE = "recommendation_settings_changed"
SEASONS = {
    "before": "Before heat season",
    "during": "During heat season",
    "after": "After heat season",
}
RISK_LABELS = {
    "elevated": "heat risk clearly raised",
    "possible": "heat risk possibly raised",
    "not_detected": "no raised heat risk detected",
    "unknown": "no estimate captured",
}
HEAT_HAZARD = "Extreme heat"
# Plan outcome code -> the feed's "Health outcome" value for it.
OUTCOME_TAGS = {"lbw": "Low birth weight", "under_5_mortality": "Under-5 mortality"}
COST_SCORE = {"No additional cost": 2, "Low": 2, "Medium": 1}
SYSTEM_PROMPT = (
    "You help district health and cross-sector planners act on climate and "
    "health evidence. Write two or three short sentences in plain language: "
    "what the estimate means for this place and why the first recommended "
    "action is a sensible start. Use only the facts given; never invent "
    "numbers, places or actions."
)


class RecommendationError(ValueError):
    def __init__(self, code: str, status_code: int) -> None:
        super().__init__(code)
        self.code = code
        self.status_code = status_code


def recommend(
    session: Session,
    user: CurrentUserContext,
    plan_id: str,
    request: RecommendationRequest,
) -> RecommendationResponse:
    record = readable_plan(session, user, plan_id)
    plan = plan_response(record)
    place = session.get(AppGeography, plan.admin_unit_id or plan.geography_id)
    country = place.country_code if place else None
    candidates = [
        action
        for action in list_actions(country).items
        if HEAT_HAZARD in action.hazards
    ]
    settings = _settings(session)
    ranked, ranker, ranker_model, ranker_note = _rank(
        plan, country, candidates, settings.ranker
    )
    ranked = ranked[: request.limit]
    titles = {action.id: action.title for action in candidates}

    insight = _insight(record, plan, ranked, titles, settings)
    session.commit()
    return RecommendationResponse(
        ranker=ranker,
        ranker_model=ranker_model,
        ranker_note=ranker_note,
        items=ranked,
        insight=insight,
    )


def _rank(
    plan: SavedPlanResponse,
    country: str | None,
    candidates: list[ActionContent],
    ranker: str,
) -> tuple[list[RankedAction], str, str | None, str | None]:
    timing = plan.signals.timing
    season = SEASONS[timing].lower()
    outcome = OUTCOME_TAGS.get(plan.outcome)
    risk = plan.signals.risk_level
    scored = []
    for order, action in enumerate(candidates):
        reasons: list[str] = []
        score = 0
        if timing in action.seasons:
            score += 4
            reasons.append(f"Fits {season}, when this plan applies.")
        if outcome and outcome in action.health_outcomes:
            score += 3
            reasons.append(f"Targets {outcome.lower()}, this plan's outcome.")
        if risk == "elevated":
            reasons.append(
                "Heat risk is clearly raised, so it is worth acting at any cost."
            )
        elif action.cost_level in COST_SCORE:
            score += COST_SCORE[action.cost_level]
            if COST_SCORE[action.cost_level] == 2:
                reasons.append(
                    "Low cost: a proportionate first step while risk is uncertain."
                )
        scored.append((action, reasons, float(score), order))

    if ranker == "classifier":
        try:
            scores, model = providers.classify(
                {
                    "outcome": plan.outcome,
                    "country_code": country,
                    "risk_level": risk,
                    "timing": timing,
                    "percent": plan.figure.percent,
                    "ratio": (
                        plan.figure.ratio.model_dump() if plan.figure.ratio else None
                    ),
                },
                [
                    action.model_dump(
                        include={
                            "id",
                            "title",
                            "seasons",
                            "cost_level",
                            "health_outcomes",
                            "target_populations",
                            "action_types",
                            "departments",
                        }
                    )
                    for action in candidates
                ],
            )
        except providers.ProviderError as exc:
            logger.warning("Classifier ranking failed (%s); using rules", exc)
            note = "The classifier was unavailable, so the rules ranking is shown."
            return _order(scored), "rules", None, note
        scored = [
            (action, reasons, scores.get(action.id, float("-inf")), order)
            for action, reasons, _, order in scored
        ]
        return _order(scored), "classifier", model, None
    return _order(scored), "rules", None, None


def _order(scored) -> list[RankedAction]:
    return [
        RankedAction(id=action.id, reasons=reasons)
        for action, reasons, _, _ in sorted(scored, key=lambda row: (-row[2], row[3]))
    ]


def _insight(record, plan, ranked, titles, settings) -> Insight:
    provider = settings.insight_provider
    model = settings.insight_model
    template = _template(plan, ranked, titles)
    if provider == "template" or not model:
        return Insight(provider="template", model=None, text=template, generated=False)

    key = {
        "provider": provider,
        "model": model,
        "ranking": [item.id for item in ranked],
    }
    cached = record.insight or {}
    if {k: cached.get(k) for k in key} == key and cached.get("text"):
        return Insight(
            provider=provider, model=model, text=cached["text"], generated=True
        )
    try:
        text = providers.generate(
            provider, model, SYSTEM_PROMPT, _prompt(plan, ranked, titles)
        )
    except providers.ProviderError as exc:
        logger.warning(
            "Insight from %s/%s failed (%s); using template", provider, model, exc
        )
        return Insight(
            provider="template",
            model=None,
            text=template,
            generated=False,
            note=f"{provider} could not write an insight, so the template is shown.",
        )
    record.insight = {**key, "text": text}
    return Insight(provider=provider, model=model, text=text, generated=True)


def _facts(plan: SavedPlanResponse) -> tuple[str, str, str, str]:
    outcome = outcome_label(plan.outcome).lower()
    place = plan.figure.place or "this place"
    risk = RISK_LABELS[plan.signals.risk_level]
    season = SEASONS[plan.signals.timing].lower()
    return outcome, place, risk, season


def _template(plan, ranked, titles) -> str:
    outcome, place, risk, season = _facts(plan)
    first = titles.get(ranked[0].id) if ranked else None
    return " ".join(
        [
            f"For {outcome} in {place}, the model shows {risk}.",
            (
                f'Starting {season} with "{first}" keeps the response proportionate to that signal.'
                if first
                else f"No published heat action is available for {place} yet."
            ),
            "Review the evidence and stakeholders in each action before assigning it.",
        ]
    )


def _prompt(plan, ranked, titles) -> str:
    outcome, place, risk, season = _facts(plan)
    figure = plan.figure
    estimate = (
        f"{figure.percent:.1f}% of {outcome} cases may be attributable to heat in "
        f"{figure.when}"
        if figure.status == "captured" and figure.percent is not None
        else "No estimate was captured."
    )
    if figure.ratio:
        estimate += (
            f" ({figure.ratio.kind.replace('_', ' ')} {figure.ratio.value:.2f}, "
            f"95% CI {figure.ratio.low:.2f}-{figure.ratio.high:.2f})"
        )
    actions = "\n".join(
        f"{index}. {titles.get(item.id, item.id)}: {' '.join(item.reasons)}"
        for index, item in enumerate(ranked, 1)
    )
    return (
        f"Outcome: {outcome}\nPlace: {place}\nEstimate: {estimate}\n"
        f"Reading: {risk}\nTiming: {season}\nRecommended actions in order:\n{actions}"
    )


def read_settings(session: Session) -> RecommendationSettingsResponse:
    row = session.get(RecommendationSetting, SETTING_ID)
    return RecommendationSettingsResponse(
        settings=_settings(session),
        rankers=[_option(item) for item in providers.rankers()],
        providers=[_option(item) for item in providers.insight_providers()],
        updated_by_user_id=row.updated_by_user_id if row else None,
        updated_at=row.updated_at if row else None,
    )


def update_settings(
    session: Session, user: CurrentUserContext, values: RecommendationSettings
) -> RecommendationSettingsResponse:
    rankers = {item.id: item for item in providers.rankers()}
    insight = {item.id: item for item in providers.insight_providers()}
    if values.ranker not in rankers:
        raise RecommendationError("RANKER_UNKNOWN", 422)
    if not rankers[values.ranker].available:
        raise RecommendationError("RANKER_NOT_CONFIGURED", 422)
    if values.insight_provider not in insight:
        raise RecommendationError("INSIGHT_PROVIDER_UNKNOWN", 422)
    if not insight[values.insight_provider].available:
        raise RecommendationError("INSIGHT_PROVIDER_NOT_CONFIGURED", 422)
    model = (values.insight_model or "").strip() or None
    if values.insight_provider != "template" and model is None:
        raise RecommendationError("INSIGHT_MODEL_REQUIRED", 422)
    after = RecommendationSettings(
        ranker=values.ranker,
        insight_provider=values.insight_provider,
        insight_model=model if values.insight_provider != "template" else None,
    )
    before = _settings(session)
    _ensure_user(session, user)
    now = datetime.now(timezone.utc)
    row = session.get(RecommendationSetting, SETTING_ID)
    if row is None:
        row = RecommendationSetting(id=SETTING_ID, **after.model_dump())
        session.add(row)
    else:
        for field, value in after.model_dump().items():
            setattr(row, field, value)
    row.updated_by_user_id = user.user_id
    row.updated_at = now
    session.add(
        AuditEventRecord(
            user_id=user.user_id,
            session_id="server",
            flush_id=f"recommendation-settings-{uuid.uuid4()}",
            client_seq=0,
            event_type=AUDIT_EVENT_TYPE,
            occurred_at=now,
            payload={"before": before.model_dump(), "after": after.model_dump()},
        )
    )
    session.commit()
    return read_settings(session)


def models_for(provider: str) -> ProviderModels:
    statuses = {item.id: item for item in providers.insight_providers()}
    if provider not in statuses:
        raise RecommendationError("INSIGHT_PROVIDER_UNKNOWN", 404)
    if not statuses[provider].available:
        raise RecommendationError("INSIGHT_PROVIDER_NOT_CONFIGURED", 422)
    if provider == "template":
        return ProviderModels(provider=provider, models=[], source="none")
    try:
        models, source = providers.list_models(provider)
    except Exception as exc:
        logger.warning("Listing %s models failed (%s)", provider, type(exc).__name__)
        raise RecommendationError("INSIGHT_MODELS_UNAVAILABLE", 502) from exc
    return ProviderModels(provider=provider, models=models, source=source)


def _settings(session: Session) -> RecommendationSettings:
    row = session.get(RecommendationSetting, SETTING_ID)
    if row is None:
        return RecommendationSettings()
    return RecommendationSettings(
        ranker=row.ranker,
        insight_provider=row.insight_provider,
        insight_model=row.insight_model,
    )


def _option(status: providers.ProviderStatus) -> ProviderOption:
    return ProviderOption(
        id=status.id,
        label=status.label,
        available=status.available,
        reason=status.reason,
    )
