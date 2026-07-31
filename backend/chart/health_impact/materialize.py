"""Turn one completed prediction into a persisted ``health_impact`` row.

Called from the Dagster job that just recorded a completed
``PredictionRequestRecord``. The bridge is idempotent on the dashboard
grain ``(admin_unit, scenario, horizon, valid_month)`` so a retry after
a mid-transaction failure updates the same row rather than duplicating.

Session commits are the caller's responsibility so a downstream failure
in the same transaction leaves nothing behind.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from chart.climate import scenarios as scenario_map
from chart.shared.db.models import (
    AdminUnit,
    ClimateRun,
    Covariate,
    DataLabel,
    ErfParameters,
    HealthImpact,
)

from .derivation import (
    attributable_fraction_milli,
    attributable_number,
    relative_risk_milli,
)


class ErfParametersNotFound(LookupError):
    """No fitted curve is on file for this geography and outcome."""


PLANNING_TARGET_TO_HORIZON: dict[str, str] = {
    "month": "m1",
    "next_three_months": "m3",
    "next_heat_season": "m6",
    "long_term_hot_season": "y15",
}


@dataclass(frozen=True)
class MaterializationInput:
    """Everything the bridge needs, gathered by the Dagster op.

    Kept explicit rather than pulling directly off the request record so
    the bridge stays cleanly unit-testable and never has to reach into
    the JSON blob shapes of ``result_payload``.
    """

    admin_unit_id: int
    geography_id: int
    outcome: str
    planning_target: str
    valid_month: date
    climate_run_id: int
    ssp_scenario: str | None
    odds_ratio: float
    ci95_low: float
    ci95_high: float
    ensemble_spread: float | None = None


@dataclass(frozen=True)
class HealthImpactWriteResult:
    row: HealthImpact
    created: bool


def _resolve_scenario_label(ssp_scenario: str | None) -> str:
    """Choose the scenario label the dashboard reads at."""

    if ssp_scenario is None:
        return "seas5_ensemble"
    return scenario_map.to_rcp_or_none(ssp_scenario) or ssp_scenario


def _resolve_horizon(planning_target: str) -> str:
    try:
        return PLANNING_TARGET_TO_HORIZON[planning_target]
    except KeyError:
        return "m1"


def _resolve_data_label(ssp_scenario: str | None) -> DataLabel:
    if ssp_scenario is None:
        return DataLabel.forecast
    return DataLabel.projection


def _load_active_erf(
    session: Session, geography_id: int, outcome: str
) -> ErfParameters:
    row = session.scalar(
        select(ErfParameters)
        .where(
            ErfParameters.geography_id == geography_id,
            ErfParameters.outcome == outcome,
        )
        .order_by(ErfParameters.published_at.desc(), ErfParameters.id.desc())
    )
    if row is None:
        raise ErfParametersNotFound(f"geography={geography_id} outcome={outcome}")
    return row


def _load_population(
    session: Session, admin_unit_id: int, valid_year: int
) -> int | None:
    """Return the SSP2 population for one place and calendar year, if any.

    Absence is not an error; the dashboard renders ``attributable_number``
    as null when the covariate is missing.
    """

    value = session.scalar(
        select(Covariate.value).where(
            Covariate.admin_unit_id == admin_unit_id,
            Covariate.kind == "population",
            Covariate.scenario_socio == "ssp2",
            Covariate.valid_year == valid_year,
        )
    )
    if value is None:
        return None
    return int(round(value))


def materialize_health_impact(
    session: Session, spec: MaterializationInput
) -> HealthImpactWriteResult:
    """Compute and persist one dashboard row from a completed prediction."""

    admin_unit = session.get(AdminUnit, spec.admin_unit_id)
    if admin_unit is None:
        raise LookupError(f"admin_unit={spec.admin_unit_id} not found")
    climate_run = session.get(ClimateRun, spec.climate_run_id)
    if climate_run is None:
        raise LookupError(f"climate_run={spec.climate_run_id} not found")

    erf = _load_active_erf(session, spec.geography_id, spec.outcome)
    scenario = _resolve_scenario_label(spec.ssp_scenario)
    horizon = _resolve_horizon(spec.planning_target)
    data_label = _resolve_data_label(spec.ssp_scenario)

    rr_milli = relative_risk_milli(spec.odds_ratio)
    rr_low_milli = relative_risk_milli(spec.ci95_low)
    rr_high_milli = relative_risk_milli(spec.ci95_high)
    af_milli = attributable_fraction_milli(spec.odds_ratio)
    population = _load_population(
        session, spec.admin_unit_id, spec.valid_month.year
    )
    an = attributable_number(af_milli, population)
    spread_milli = (
        None
        if spec.ensemble_spread is None
        else _clamp_milli(spec.ensemble_spread * 1000)
    )

    existing = session.scalar(
        select(HealthImpact).where(
            HealthImpact.admin_unit_id == spec.admin_unit_id,
            HealthImpact.scenario == scenario,
            HealthImpact.horizon == horizon,
            HealthImpact.valid_month == spec.valid_month,
        )
    )

    if existing is not None:
        existing.erf_parameters_id = erf.id
        existing.climate_run_id = spec.climate_run_id
        existing.relative_risk_milli = rr_milli
        existing.rr_ci_low_milli = rr_low_milli
        existing.rr_ci_high_milli = rr_high_milli
        existing.attributable_fraction_milli = af_milli
        existing.attributable_number = an
        existing.ensemble_spread_milli = spread_milli
        existing.data_label = data_label
        session.flush()
        return HealthImpactWriteResult(row=existing, created=False)

    row = HealthImpact(
        admin_unit_id=spec.admin_unit_id,
        erf_parameters_id=erf.id,
        climate_run_id=spec.climate_run_id,
        scenario=scenario,
        horizon=horizon,
        valid_month=spec.valid_month,
        relative_risk_milli=rr_milli,
        rr_ci_low_milli=rr_low_milli,
        rr_ci_high_milli=rr_high_milli,
        attributable_fraction_milli=af_milli,
        attributable_number=an,
        ensemble_spread_milli=spread_milli,
        data_label=data_label,
    )
    session.add(row)
    session.flush()
    return HealthImpactWriteResult(row=row, created=True)


def _clamp_milli(value: float) -> int:
    """Local copy so materialize does not import a private helper."""
    if value < 0:
        return 0
    if value > 100_000:
        return 100_000
    return round(value)
