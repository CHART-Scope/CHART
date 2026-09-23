from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict, Field


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


class CurrentObservationResponse(BaseModel):
    """Latest reanalysis-based climate reading for the selected place.

    Empty when no observed rows exist yet for the admin_unit; the caller
    renders a "no reading yet" state rather than treating this as an
    error. ``period_month`` is the first day of the calendar month the
    value belongs to (matches ``district_climate.period_month``).
    """

    admin_unit_id: int
    admin_unit_code: str
    period_month: date | None
    variable: str | None
    value: float | None
    unit: str | None
    source_name: str | None
    updated_at: date | None


class MonthlyTemperature(BaseModel):
    """The month's maximum temperature, area-level, from ERA5.

    The variable is maximum temperature; the monthly value is the mean of
    its daily values, which is what the model was fitted on and therefore
    what it consumes. The month's single hottest day is deliberately not
    used. The dashboard says "maximum temperature" rather than "average
    maximum temperature", which reads as a contradiction - agreed on the
    17 Sep modelling call.
    """

    tmax_monthly_mean_c: float
    unit: str
    source_name: str | None
    climate_run_id: int
    data_label: str


class MonthlyHealthImpactPoint(HealthImpactPoint):
    horizon: str
    climate_run_id: int


class MonthlyPrediction(BaseModel):
    request_id: int
    attributable_fraction_milli: int
    odds_ratio: float
    # Nullable: a release need not declare a reference, and the dashboard
    # drops the comparison clause when it has none rather than inventing one.
    reference_temperature_c: float | None = None
    # "mmt" | "median" | "mean" | "editorial", from the release manifest.
    # None when the release does not declare one, in which case the UI must
    # fall back to the neutral "reference temperature" wording.
    reference_kind: str | None = None
    ci95_low: float
    ci95_high: float
    on_training_support: bool
    warning: str | None
    model_version: str
    # The whole exposure vector the model was scored on, lag 0 first - three
    # months for low birth weight, four days for under five. The card shows a
    # single temperature for the selected month, which made two months with
    # the same headline value return different answers for no visible reason:
    # Garissa June and August 2026 both read 32.08 C, but June's lag months
    # were 34.1/34.4 and August's 31.9/32.1, giving OR 1.03 against 0.91.
    exposure_temperatures_c: list[float] = Field(default_factory=list)
    # Observed days behind a day-grain exposure, lag 0 first; empty for a
    # month-grain model.
    exposure_dates: list[date] = Field(default_factory=list)
    input_statistic: str = "tmax_monthly_mean_c"
    fraction_method: str = "positive_excess_odds_ratio_approximation"
    # Every shipped release declares output_contract.attributable_fraction =
    # "positive_excess_only", and the fraction above is clamped under that
    # policy. Declared here so the dashboard applies the same rule to the
    # signed odds change instead of assuming it. Source it from the release
    # if a future model ever declares a different policy.
    attributable_fraction_policy: str = "positive_excess_only"


class MonthlyRiskValues(BaseModel):
    prediction: MonthlyPrediction | None = None
    temperature: MonthlyTemperature | None = None
    health_impacts: list[MonthlyHealthImpactPoint] = Field(default_factory=list)


class AreaBoundingBox(BaseModel):
    """The area the climate data for this place was requested over.

    ERA5 is retrieved from the Climate Data Store as a bounding box, not by
    place name, so this is the literal `area` in that request. Surfacing it is
    what lets the dashboard say which patch of the grid a temperature came
    from; the Climate Data Store has no per-location URL, so the box is the
    addressable part.
    """

    north: float
    west: float
    south: float
    east: float


class MapArea(BaseModel):
    """One administrative area, its shape, and its value if it has one.

    An area with no fitted model, or with a model but no computed month, is
    still returned - with a null value and a stated reason. Dropping it would
    redraw the country as though the gap were sea.
    """

    geography_id: str | None = None
    admin_unit_id: int
    code: str
    name: str
    level: str
    value_percent: float | None = None
    #: Why there is no value: "no_model", "running", or "no_prediction".
    #: None when there is a value. "running" means a job is in flight for this
    #: area and month, so the map can say the data is on its way rather than
    #: implying nobody has asked for it.
    missing_reason: str | None = None
    odds_ratio: float | None = None
    on_training_support: bool | None = None
    #: GeoJSON geometry, simplified for display only.
    geometry: dict | None = None


class MapResponse(BaseModel):
    """A choropleth of one metric over the areas beneath a geography.

    Deliberately not the grid in the design references: these are
    administrative areas carrying an area-level value. Rendering cells from an
    area value would imply a spatial resolution the model does not have.
    """

    geography_id: str
    outcome: str
    month: str | None = None
    metric: str = "attributable_fraction"
    unit: str = "percent"
    #: [west, south, east, north], so the client can frame the drawing.
    bounds: list[float] = Field(default_factory=list)
    #: Douglas-Peucker tolerance in degrees applied to the returned shapes.
    #: Disclosed so nobody mistakes display geometry for analysis geometry -
    #: climate extraction always uses the unsimplified boundary.
    simplify_tolerance_degrees: float = 0.0
    areas: list[MapArea] = Field(default_factory=list)


class MonthlyRiskResponse(BaseModel):
    admin_unit_id: int
    admin_unit_code: str
    area_bbox: AreaBoundingBox | None = Field(
        default=None,
        description="Bounding box the ERA5 request for this place was made over.",
    )
    months: dict[str, MonthlyRiskValues] = Field(
        default_factory=dict,
        description="Calendar months keyed YYYY-MM. Missing data is never interpolated.",
    )
