from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict


class HealthImpactPoint(BaseModel):
    """One point on a dashboard chart series."""

    model_config = ConfigDict(from_attributes=True)

    valid_month: date
    relative_risk_milli: int
    rr_ci_low_milli: int
    rr_ci_high_milli: int
    attributable_fraction_milli: int
    attributable_number: int | None
    ensemble_spread_milli: int | None
    scenario: str
    data_label: str


class HorizonCard(BaseModel):
    """One "IN 3 MONTHS" / "IN 6 MONTHS" style card."""

    horizon: str
    valid_month: date
    attributable_fraction_milli: int
    attributable_number: int | None
    rr_ci_low_milli: int
    rr_ci_high_milli: int
    precision: str


class ShortTermRiskResponse(BaseModel):
    admin_unit_id: int
    admin_unit_code: str
    series: list[HealthImpactPoint]
    cards: list[HorizonCard]


class LongTermTableRow(BaseModel):
    horizon: str
    valid_month: date
    attributable_fraction_milli: int
    attributable_number: int | None


class LongTermScenario(BaseModel):
    name: str
    label: str
    series: list[HealthImpactPoint]
    table: list[LongTermTableRow]


class LongTermRiskResponse(BaseModel):
    admin_unit_id: int
    admin_unit_code: str
    scenarios: list[LongTermScenario]
    socioeconomic_baseline: str
