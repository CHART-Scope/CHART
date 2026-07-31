"""Load precomputed ``health_impact`` rows shaped for the dashboard.

Callers pass a geography identifier and an ``admin_unit_code``; the
service resolves the admin_unit, filters rows for the panel-relevant
scenarios, and returns the response payload shape. No math happens here
- attributable fractions and case counts were computed by
:mod:`chart.health_impact.materialize` at the time the prediction
completed.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from chart.climate.scenarios import DASHBOARD_LONG_TERM_RCPS
from chart.shared.db.models import AdminUnit, ClimateRun, DistrictClimate, HealthImpact

from .schemas import (
    CurrentObservationResponse,
    HealthImpactPoint,
    HorizonCard,
    LongTermRiskResponse,
    LongTermScenario,
    LongTermTableRow,
    ShortTermRiskResponse,
)


CURRENT_OBSERVATION_VARIABLE = "tmax_monthly_mean_c"
"""The variable the dashboard's Today strip renders when it is present.

Falls back to whichever observed variable is most recent for the
admin_unit if this exact variable has not been ingested yet.
"""


SHORT_TERM_SCENARIOS: tuple[str, ...] = ("seas5_ensemble", "rcp45")
SHORT_TERM_CARD_HORIZONS: tuple[str, ...] = ("m3", "m6")
LONG_TERM_TABLE_HORIZONS: tuple[str, ...] = ("y5", "y15", "y25")
SOCIOECONOMIC_BASELINE = "ssp2"

_RCP_LABELS: dict[str, str] = {
    "rcp26": "Very low emissions (RCP 2.6)",
    "rcp45": "Low emissions (RCP 4.5)",
    "rcp60": "High emissions (RCP 6.0)",
    "rcp85": "Very high emissions (RCP 8.5)",
}


class NoAdminUnitForGeography(LookupError):
    """The requested admin_unit_code does not exist under this geography."""


@dataclass(frozen=True)
class _Filters:
    admin_unit_id: int
    scenarios: tuple[str, ...]


def _resolve_admin_unit(
    session: Session,
    app_geography_id: str,
    admin_unit_code: str | None,
) -> AdminUnit:
    """Look up the admin_unit for a URL geography id, plus an optional code.

    The URL identifier is the ``AppGeography.id`` used across the rest of
    the API (e.g. ``geo-in-madhya-pradesh``). When ``admin_unit_code`` is
    None, we return the admin_unit already linked to that AppGeography -
    the default the user implicitly picked at onboarding - so the URL
    stays clean and the caller does not have to know the district code.
    When it is provided we still respect the exact grain, so a dashboard
    URL can point at a specific district within a state-level geography.
    """

    query = select(AdminUnit).where(AdminUnit.app_geography_id == app_geography_id)
    if admin_unit_code is not None:
        query = query.where(AdminUnit.code == admin_unit_code)
    admin_unit = session.scalar(query)
    if admin_unit is None:
        raise NoAdminUnitForGeography(
            f"{app_geography_id}" + (f"/{admin_unit_code}" if admin_unit_code else "")
        )
    return admin_unit


def _fetch_rows(session: Session, filters: _Filters) -> list[HealthImpact]:
    return list(
        session.scalars(
            select(HealthImpact)
            .where(
                HealthImpact.admin_unit_id == filters.admin_unit_id,
                HealthImpact.scenario.in_(filters.scenarios),
            )
            .order_by(HealthImpact.scenario, HealthImpact.valid_month)
        )
    )


def _precision_for_ci(low_milli: int, high_milli: int) -> str:
    """Rough precision badge derived from the CI width."""

    spread_milli = max(high_milli - low_milli, 0)
    if spread_milli <= 100:
        return "high"
    if spread_milli <= 300:
        return "moderate"
    return "low"


def _to_point(row: HealthImpact) -> HealthImpactPoint:
    return HealthImpactPoint(
        valid_month=row.valid_month,
        relative_risk_milli=row.relative_risk_milli,
        rr_ci_low_milli=row.rr_ci_low_milli,
        rr_ci_high_milli=row.rr_ci_high_milli,
        attributable_fraction_milli=row.attributable_fraction_milli,
        attributable_number=row.attributable_number,
        ensemble_spread_milli=row.ensemble_spread_milli,
        scenario=row.scenario,
        data_label=row.data_label.value,
    )


def _cards_from_rows(rows: list[HealthImpact]) -> list[HorizonCard]:
    by_horizon: dict[str, HealthImpact] = {}
    for row in rows:
        by_horizon.setdefault(row.horizon, row)
    cards: list[HorizonCard] = []
    for horizon in SHORT_TERM_CARD_HORIZONS:
        entry = by_horizon.get(horizon)
        if entry is None:
            continue
        cards.append(
            HorizonCard(
                horizon=horizon,
                valid_month=entry.valid_month,
                attributable_fraction_milli=entry.attributable_fraction_milli,
                attributable_number=entry.attributable_number,
                rr_ci_low_milli=entry.rr_ci_low_milli,
                rr_ci_high_milli=entry.rr_ci_high_milli,
                precision=_precision_for_ci(
                    entry.rr_ci_low_milli, entry.rr_ci_high_milli
                ),
            )
        )
    return cards


def load_short_term_view(
    session: Session,
    app_geography_id: str,
    admin_unit_code: str | None = None,
) -> ShortTermRiskResponse:
    try:
        admin_unit = _resolve_admin_unit(
            session, app_geography_id, admin_unit_code
        )
    except NoAdminUnitForGeography:
        if admin_unit_code is not None:
            raise
        return ShortTermRiskResponse(
            admin_unit_id=0,
            admin_unit_code="",
            series=[],
            cards=[],
        )
    rows = _fetch_rows(
        session,
        _Filters(admin_unit_id=admin_unit.id, scenarios=SHORT_TERM_SCENARIOS),
    )
    series = [_to_point(row) for row in rows]
    cards = _cards_from_rows(rows)
    return ShortTermRiskResponse(
        admin_unit_id=admin_unit.id,
        admin_unit_code=admin_unit.code,
        series=series,
        cards=cards,
    )


def load_long_term_view(
    session: Session,
    app_geography_id: str,
    admin_unit_code: str | None = None,
) -> LongTermRiskResponse:
    try:
        admin_unit = _resolve_admin_unit(
            session, app_geography_id, admin_unit_code
        )
    except NoAdminUnitForGeography:
        if admin_unit_code is not None:
            raise
        return LongTermRiskResponse(
            admin_unit_id=0,
            admin_unit_code="",
            scenarios=[
                LongTermScenario(
                    name=name,
                    label=_RCP_LABELS.get(name, name),
                    series=[],
                    table=[],
                )
                for name in DASHBOARD_LONG_TERM_RCPS
            ],
            socioeconomic_baseline=SOCIOECONOMIC_BASELINE,
        )
    rows = _fetch_rows(
        session,
        _Filters(admin_unit_id=admin_unit.id, scenarios=DASHBOARD_LONG_TERM_RCPS),
    )
    by_scenario: dict[str, list[HealthImpact]] = {
        name: [] for name in DASHBOARD_LONG_TERM_RCPS
    }
    for row in rows:
        by_scenario.setdefault(row.scenario, []).append(row)

    scenarios = [
        _build_long_term_scenario(name, by_scenario.get(name, []))
        for name in DASHBOARD_LONG_TERM_RCPS
    ]
    return LongTermRiskResponse(
        admin_unit_id=admin_unit.id,
        admin_unit_code=admin_unit.code,
        scenarios=scenarios,
        socioeconomic_baseline=SOCIOECONOMIC_BASELINE,
    )


def load_current_observation(
    session: Session,
    app_geography_id: str,
    admin_unit_code: str | None = None,
) -> CurrentObservationResponse:
    """Read the most recent observed climate value for one place.

    Prefers the canonical dashboard variable (``tmax_monthly_mean_c``)
    but falls back to the newest observed row of any variable so the
    strip renders as soon as any reanalysis data has landed.
    """

    try:
        admin_unit = _resolve_admin_unit(
            session, app_geography_id, admin_unit_code
        )
    except NoAdminUnitForGeography:
        if admin_unit_code is not None:
            raise
        return _empty_current_observation()

    row = _select_latest_observed(
        session, admin_unit.id, CURRENT_OBSERVATION_VARIABLE
    )
    if row is None:
        row = _select_latest_observed(session, admin_unit.id, variable=None)

    if row is None:
        return CurrentObservationResponse(
            admin_unit_id=admin_unit.id,
            admin_unit_code=admin_unit.code,
            period_month=None,
            variable=None,
            value=None,
            unit=None,
            source_name=None,
            updated_at=None,
        )

    district_row, source_name = row
    return CurrentObservationResponse(
        admin_unit_id=admin_unit.id,
        admin_unit_code=admin_unit.code,
        period_month=district_row.period_month,
        variable=district_row.variable,
        value=district_row.value,
        unit=district_row.unit,
        source_name=source_name,
        updated_at=district_row.period_month,
    )


def _select_latest_observed(
    session: Session,
    admin_unit_id: int,
    variable: str | None,
) -> tuple[DistrictClimate, str | None] | None:
    query = (
        select(DistrictClimate, ClimateRun.source_name)
        .join(ClimateRun, ClimateRun.id == DistrictClimate.climate_run_id)
        .where(
            DistrictClimate.admin_unit_id == admin_unit_id,
            ClimateRun.tier == "observed",
        )
        .order_by(DistrictClimate.period_month.desc(), DistrictClimate.id.desc())
        .limit(1)
    )
    if variable is not None:
        query = query.where(DistrictClimate.variable == variable)
    result = session.execute(query).first()
    return None if result is None else (result[0], result[1])


def _empty_current_observation() -> CurrentObservationResponse:
    return CurrentObservationResponse(
        admin_unit_id=0,
        admin_unit_code="",
        period_month=None,
        variable=None,
        value=None,
        unit=None,
        source_name=None,
        updated_at=None,
    )


def _build_long_term_scenario(
    name: str, rows: list[HealthImpact]
) -> LongTermScenario:
    by_horizon: dict[str, HealthImpact] = {}
    for row in rows:
        by_horizon.setdefault(row.horizon, row)
    table = [
        LongTermTableRow(
            horizon=horizon,
            valid_month=entry.valid_month,
            attributable_fraction_milli=entry.attributable_fraction_milli,
            attributable_number=entry.attributable_number,
        )
        for horizon in LONG_TERM_TABLE_HORIZONS
        if (entry := by_horizon.get(horizon)) is not None
    ]
    return LongTermScenario(
        name=name,
        label=_RCP_LABELS.get(name, name),
        series=[_to_point(row) for row in rows],
        table=table,
    )
