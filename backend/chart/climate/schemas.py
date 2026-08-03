from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

ProjectionScenario = Literal["ssp126", "ssp370", "ssp585"]
ProjectionPeriod = Literal["2031-2040"]
PregnancyWindow = Literal[1, 2, 3]
PlanningTarget = Literal[
    "month",
    "next_three_months",
    "next_heat_season",
    "long_term_hot_season",
]

PredictionStatus = Literal["waiting", "queued", "running", "completed", "failed"]
PredictionStage = Literal[
    "waiting_for_data",
    "queued",
    "preparing_climate",
    "climate_ready",
    "predicting",
    "completed",
    "failed",
]
AvailabilityStatus = Literal[
    "ready", "partial", "missing", "stale", "sample", "not_available"
]
ClimateMonthStatus = Literal["waiting", "ready", "stale", "sample", "failed"]


class PreviewRequest(BaseModel):
    geography_id: str = Field(
        min_length=1,
        description="The place selected in CHART, for example geo-in-madhya-pradesh.",
    )
    planning_date: date = Field(
        description="The planning month; CHART derives this month and the previous two."
    )


class PredictRequest(PreviewRequest):
    outcome: Literal["lbw"] = "lbw"
    planning_target: PlanningTarget = "month"
    projection_scenario: ProjectionScenario | None = None
    projection_period: ProjectionPeriod | None = None
    pregnancy_window: PregnancyWindow = Field(
        default=1,
        description="Legacy single model window. New planning requests use pregnancy_windows.",
    )
    pregnancy_windows: tuple[PregnancyWindow, ...] | None = Field(
        default=None,
        description=(
            "Pregnancy-stage model windows to calculate from the same three climate "
            "months. Window 3 is first, 2 is middle, and 1 is final."
        ),
    )

    @model_validator(mode="after")
    def validate_projection_choice(self):
        if self.pregnancy_windows is not None:
            if not self.pregnancy_windows or len(set(self.pregnancy_windows)) != len(
                self.pregnancy_windows
            ):
                raise ValueError("PREGNANCY_WINDOWS_INVALID")
        if self.planning_target == "long_term_hot_season":
            if self.projection_scenario is None or self.projection_period is None:
                raise ValueError("CLIMATE_PROJECTION_CHOICE_REQUIRED")
            if self.planning_date != date(2040, 5, 1):
                raise ValueError("CLIMATE_PROJECTION_PLANNING_DATE_INVALID")
        elif self.projection_scenario is not None or self.projection_period is not None:
            raise ValueError("CLIMATE_PROJECTION_FIELDS_NOT_ALLOWED")
        return self

    def selected_pregnancy_windows(self) -> tuple[PregnancyWindow, ...]:
        return self.pregnancy_windows or (self.pregnancy_window,)


class PlaceResponse(BaseModel):
    geography_id: str
    code: str
    name: str
    level: str
    path: str
    supports_prediction: bool
    model_version: str | None = None


class ClimateMonthResponse(BaseModel):
    month: str
    temperature_c: float | None = None
    status: ClimateMonthStatus
    source_name: str | None = None
    source_class: str | None = None
    source_uri: str | None = None
    source_issue_time: str | None = None
    downloaded_at: str | None = None
    data_label: str | None = None
    quality_status: str | None = None
    climate_run_id: int | None = None
    raw_file_uri: str | None = None
    raw_file_hash: str | None = None
    scenario: str | None = None
    projection_period: str | None = None
    ensemble_summary: str | None = None
    expected_source_class: str | None = None
    expected_source_name: str
    source_policy_version: str
    unavailable_reason: str | None = None


class Availability(BaseModel):
    status: AvailabilityStatus
    months_requested: int = 3
    months_found: int
    missing_months: list[str]
    input_window_id: int | None = None
    input_hash: str | None = None
    message: str


class PreviewResponse(BaseModel):
    place: PlaceResponse
    planning_date: date
    source_as_of: date | None = None
    availability: Availability
    climate: list[ClimateMonthResponse]


class LbwPrediction(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

    area: str
    geography_level: str
    pregnancy_window: PregnancyWindow
    temperatures_c: list[float] = Field(min_length=3, max_length=3)
    reference_temperature_c: float
    odds_ratio: float = Field(gt=0)
    ci95_low: float = Field(gt=0)
    ci95_high: float = Field(gt=0)
    on_training_support: bool
    model_file: str = Field(min_length=1)
    model_version: str = Field(min_length=1)
    model_sha256: str | None = Field(default=None, pattern=r"^[0-9a-fA-F]{64}$")
    warning: str | None = None
    explanation: str | None = None

    @model_validator(mode="after")
    def validate_confidence_interval(self):
        if not self.ci95_low <= self.odds_ratio <= self.ci95_high:
            raise ValueError("LBW_CONFIDENCE_INTERVAL_INVALID")
        return self


class PredictResponse(PreviewResponse):
    prediction: LbwPrediction
    predictions: list[LbwPrediction] = Field(default_factory=list)
    request_id: int
    request_status: Literal["completed"] = "completed"
    planning_target: PlanningTarget = "month"
    projection_scenario: ProjectionScenario | None = None
    projection_period: ProjectionPeriod | None = None


class PredictionAcceptedResponse(BaseModel):
    request_id: int
    status: Literal["waiting", "queued", "running"]
    stage: PredictionStage
    geography_id: str
    planning_date: date
    source_as_of: date | None = None
    status_url: str
    message: str
    available_from: date | None = None
    planning_target: PlanningTarget = "month"
    projection_scenario: ProjectionScenario | None = None
    projection_period: ProjectionPeriod | None = None


class PredictionRequestStatusResponse(BaseModel):
    request_id: int
    status: PredictionStatus
    stage: PredictionStage
    geography_id: str
    planning_date: date
    source_as_of: date | None = None
    dagster_run_id: str | None = None
    error_code: str | None = None
    climate: list[ClimateMonthResponse] = Field(default_factory=list)
    result: PredictResponse | None = None
    created_at: str
    updated_at: str
    available_from: date | None = None
    planning_target: PlanningTarget = "month"
    projection_scenario: ProjectionScenario | None = None
    projection_period: ProjectionPeriod | None = None


class PredictionRequestSummaryResponse(BaseModel):
    request_id: int
    status: PredictionStatus
    stage: PredictionStage
    geography_id: str
    planning_date: date
    source_as_of: date | None = None
    error_code: str | None = None
    created_at: str
    updated_at: str
    available_from: date | None = None
    planning_target: PlanningTarget = "month"
    projection_scenario: ProjectionScenario | None = None
    projection_period: ProjectionPeriod | None = None
    odds_ratio: float | None = None


class PredictionRequestListResponse(BaseModel):
    items: list[PredictionRequestSummaryResponse]


class PlaceListResponse(BaseModel):
    items: list[PlaceResponse]


class HeatSeasonOptionResponse(BaseModel):
    label: str
    months: list[date]
    planning_date: date
    available: bool
    available_from: date | None = None
    unavailable_reason: str | None = None
    source_name: str
    source_uri: str


class ProjectionScenarioOptionResponse(BaseModel):
    value: ProjectionScenario
    label: str
    description: str


class LongTermProjectionOptionResponse(BaseModel):
    label: str
    period: ProjectionPeriod
    months: list[date]
    planning_date: date
    scenarios: list[ProjectionScenarioOptionResponse]
    source_name: str
    source_uri: str


class PlanningOptionsResponse(BaseModel):
    geography_id: str
    source_as_of: date
    validated_pregnancy_windows: list[PregnancyWindow]
    model_result_mode: Literal["single_association", "pregnancy_windows"]
    custom_min_month: date
    custom_max_month: date
    next_three_months: HeatSeasonOptionResponse
    next_heat_season: HeatSeasonOptionResponse | None = None
    long_term_projection: LongTermProjectionOptionResponse | None = None


class ErrorResponse(BaseModel):
    error: str


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"


class WhatIfRequest(BaseModel):
    geography_id: str = Field(min_length=1)
    temperature_c: float = Field(ge=-30, le=60)


class WhatIfResponse(BaseModel):
    """Mirrors the R service /predict response so the dashboard has the same
    shape as the reference `pipelines/models/lbw/web/index.html` demo. Fields
    the UI does not render today are still returned so the visuals can pull
    them in without another round-trip."""

    model_config = ConfigDict(allow_inf_nan=False)

    geography_id: str
    temperature_c: float
    area: str
    geography_level: str
    pregnancy_window: PregnancyWindow
    tmax_lag: list[float] = Field(min_length=3, max_length=3)
    reference_temperature_c: float
    odds_ratio: float = Field(gt=0)
    ci95_low: float = Field(gt=0)
    ci95_high: float = Field(gt=0)
    attributable_fraction_percent: float = Field(ge=0, le=100)
    on_training_support: bool
    warning: str | None = None
    n_training: int | None = None
    modelled_temperature_range_c: list[float] | None = Field(
        default=None, min_length=2, max_length=2
    )
    model_version: str = Field(min_length=1)

    @model_validator(mode="after")
    def validate_confidence_interval(self):
        if not self.ci95_low <= self.odds_ratio <= self.ci95_high:
            raise ValueError("LBW_CONFIDENCE_INTERVAL_INVALID")
        return self
