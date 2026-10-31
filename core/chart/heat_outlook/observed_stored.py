"""Observed months for places scored by a live model, read from stored results.

Kenya's counties are scored on read by the calibrated DLNM (``observed.py``).
Places with a live model release (India's Madhya Pradesh divisions and state)
are scored once, when their climate is loaded (``chart.climate.history``), and
their results are stored in ``prediction_result``. This module serves those
stored results in the same shape as Kenya's observed view, so both countries
share one dashboard experience and nothing is scored when a place is opened.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from chart.model_registry.service import get_active_model_mapping
from chart.model_settings.service import (
    LIVE_WINDOW_LABELS,
    LIVE_WINDOW_PREFIX,
    LiveRestriction,
)
from chart.risk.precision import precision_for_ci
from chart.risk.monthly_predictions import load_monthly_predictions
from chart.risk.schemas import MapResponse, MonthlyPrediction
from chart.risk.service import load_map_view
from chart.shared.db.models import AdminUnit, AppGeography, ModelRelease

from .schemas import (
    ObservedEstimate,
    ObservedInput,
    ObservedMonth,
    ObservedResponse,
    Option,
    Ratio,
)
from .service import (
    LBW_OUTCOME,
    OutlookNotAvailable,
    OutlookSelectionInvalid,
    _shown,
)

ALL_AGES = Option(code="all", label="Children under five")


@dataclass(frozen=True)
class StoredSelection:
    """The windows a place offers, and the one shown."""

    options: list[Option]
    code: str
    #: Stored ``pregnancy_window`` values for the shown option.
    windows: tuple[int, ...]


def stored_selection(
    outcome: str,
    validated: tuple[int, ...],
    restriction: LiveRestriction | None,
    requested: str | None,
) -> StoredSelection:
    """LBW offers each validated window the country settings leave on."""
    if outcome != LBW_OUTCOME or not validated:
        if requested not in (None, ALL_AGES.code):
            raise OutlookSelectionInvalid(requested)
        return StoredSelection([ALL_AGES], ALL_AGES.code, (0,))
    allowed = restriction.windows if restriction is not None else frozenset(validated)
    windows = sorted((w for w in validated if w in allowed), reverse=True)
    if not windows:
        raise OutlookSelectionInvalid(requested or "")
    options = [
        Option(code=f"{LIVE_WINDOW_PREFIX}{w}", label=LIVE_WINDOW_LABELS[w])
        for w in windows
    ]
    default = restriction.default_window if restriction is not None else None
    chosen = requested or (
        f"{LIVE_WINDOW_PREFIX}{default}" if default in windows else options[-1].code
    )
    if chosen not in {option.code for option in options}:
        raise OutlookSelectionInvalid(chosen)
    return StoredSelection(
        options, chosen, (int(chosen.removeprefix(LIVE_WINDOW_PREFIX)),)
    )


def live_model_release(
    session: Session, geography_id: str, outcome: str
) -> tuple[AdminUnit, str, str | None, tuple[int, ...]] | None:
    """The place's admin unit and active live release, when it has one."""
    unit = session.scalar(
        select(AdminUnit).where(AdminUnit.app_geography_id == geography_id)
    )
    if unit is None:
        return None
    model = get_active_model_mapping(session, admin_unit_id=unit.id, outcome=outcome)
    if model is None:
        return None
    release = session.get(ModelRelease, model.release_id)
    if release is None or release.status != "active":
        return None
    return (
        unit,
        model.release_id,
        model.model_area_name,
        tuple(model.validated_pregnancy_windows),
    )


def load_stored_observed(
    session: Session,
    geography_id: str,
    outcome: str,
    *,
    month: str | None = None,
    selector: str | None = None,
    restriction: LiveRestriction | None = None,
) -> ObservedResponse:
    found = live_model_release(session, geography_id, outcome)
    if found is None:
        raise OutlookNotAvailable(geography_id)
    unit, release, model_area, validated = found
    selection = stored_selection(outcome, validated, restriction, selector)
    stored = load_monthly_predictions(
        session, unit.id, None, None, outcome, windows=selection.windows
    )
    available = sorted(stored)
    if month is not None and month not in available:
        raise OutlookSelectionInvalid(month)
    chosen = month or (available[-1] if available else None)
    geography = session.get(AppGeography, geography_id)
    return ObservedResponse(
        geography_id=geography_id,
        place=unit.name,
        level=geography.level if geography else unit.level,
        outcome=outcome,
        # The release that scored the shown month, which may predate the
        # active one; the active release when no month is stored yet.
        release=stored[chosen].model_release_id if chosen else release,
        selectors=selection.options,
        selector=selection.code,
        selector_note=None,
        month=chosen,
        available_months=available,
        estimate=_estimate(outcome, stored[chosen]) if chosen else None,
        inputs=_inputs(outcome, stored[chosen]) if chosen else [],
        history=[
            ObservedMonth(
                month=key, value_percent=_estimate(outcome, row).value_percent
            )
            for key, row in sorted(stored.items())
        ],
        reference_note=(
            f"Scored by the {release} model"
            + (f" fitted for {model_area}" if model_area else "")
            + ", on ERA5 daily maximum temperature for this place."
        ),
        calibration_note=(
            "Estimates are computed when the month's climate is loaded and "
            "stored; the dashboard reads them."
        ),
        data_modes=sorted(
            (restriction.data_modes if restriction else frozenset({"observed"}))
            & {"observed", "projection"}
        ),
    )


def load_stored_observed_map(
    session: Session,
    geography_id: str,
    outcome: str,
    month: str | None,
    *,
    selector: str | None = None,
    restriction: LiveRestriction | None = None,
) -> MapResponse:
    """Shade each area with its own stored estimate; others stay empty."""
    frame = load_map_view(
        session, geography_id, month, outcome=outcome, with_values=False
    )
    by_area: dict[str, dict[str, MonthlyPrediction]] = {}
    for area in frame.areas:
        found = (
            live_model_release(session, area.geography_id, outcome)
            if area.geography_id
            else None
        )
        if found is None:
            continue
        try:
            selection = stored_selection(outcome, found[3], restriction, selector)
        except OutlookSelectionInvalid:
            # This area does not offer the chosen window; it shows none.
            by_area[area.geography_id or ""] = {}
            continue
        by_area[area.geography_id or ""] = load_monthly_predictions(
            session, found[0].id, None, None, outcome, windows=selection.windows
        )
    chosen = month or max(
        (key for rows in by_area.values() for key in rows), default=None
    )
    for area in frame.areas:
        area.odds_ratio = None
        area.value_percent = None
        area.on_training_support = None
        rows = by_area.get(area.geography_id or "")
        if rows is None:
            area.missing_reason = "no_model"
            continue
        row = rows.get(chosen or "")
        if row is None:
            area.missing_reason = "not_reported"
            continue
        estimate = _estimate(outcome, row)
        area.value_percent = estimate.value_percent
        area.missing_reason = (
            None if estimate.value_percent is not None else "no_excess"
        )
        area.odds_ratio = row.odds_ratio
        area.on_training_support = row.on_training_support
    frame.month = chosen
    frame.metric = "heat_attributable_share_observed_month"
    return frame


def _estimate(outcome: str, row: MonthlyPrediction) -> ObservedEstimate:
    shown = _shown(
        outcome,
        ALL_AGES.code,
        "heat",
        row.attributable_fraction_milli / 10,
        None,
        None,
        legacy_rules=False,
    )
    return ObservedEstimate(
        **shown,
        ratio=Ratio(
            kind="odds_ratio" if outcome == LBW_OUTCOME else "risk_ratio",
            value=round(row.odds_ratio, 4),
            low=round(row.ci95_low, 4),
            high=round(row.ci95_high, 4),
            precision=precision_for_ci(row.ci95_low, row.ci95_high),
        ),
        thin_data=not row.on_training_support,
        counties=1,
    )


def _inputs(outcome: str, row: MonthlyPrediction) -> list[ObservedInput]:
    values = row.exposure_temperatures_c
    if not values:
        return []
    if outcome == LBW_OUTCOME:
        return [
            ObservedInput(
                label=day.strftime("%b %Y"),
                era5_c=round(value, 2),
                model_scale_c=round(value, 2),
                counted=True,
            )
            for day, value in zip(row.exposure_dates, values, strict=False)
        ]
    mean = round(sum(values) / len(values), 2)
    return [
        ObservedInput(
            label="Mean daily max", era5_c=mean, model_scale_c=mean, counted=True
        )
    ]
