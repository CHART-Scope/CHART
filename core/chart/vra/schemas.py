"""Response shapes for the VRA endpoints. Scores are 0-1, or null when missing."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class ValueSchema(BaseModel):
    type: Literal["number", "integer", "binary"]
    minimum: float | None = None
    maximum: float | None = None
    example: float
    expected_values: str


class IndicatorItem(BaseModel):
    code: str
    component: str
    category: str
    name: str
    unit: str
    direction_to_risk: int
    route: str
    status: str
    rationale: str
    uploadable: bool
    value_schema: ValueSchema


class IndicatorList(BaseModel):
    items: list[IndicatorItem]


class RunSummary(BaseModel):
    id: int
    created_at: datetime
    method_version: str
    weights: str = "equal"
    area_count: int
    #: Indicators that had enough data and spread to be scored in this run.
    indicator_count: int
    class_breaks: list[float]
    input_hash: str
    output_hash: str


class Components(BaseModel):
    hazard: float | None = None
    exposure: float | None = None
    sensitivity: float | None = None
    adaptive_capacity: float | None = None
    vulnerability: float | None = None


class Coverage(BaseModel):
    hazard: float = 0.0
    exposure: float = 0.0
    sensitivity: float = 0.0
    adaptive_capacity: float = 0.0


class Driver(BaseModel):
    code: str
    name: str
    component: str
    normalised: float


class AreaAssessment(BaseModel):
    geography_id: str | None
    admin_unit_id: int
    code: str
    name: str
    risk: float | None = None
    risk_class: str | None = None
    rank: int | None = None
    components: Components = Field(default_factory=Components)
    coverage: Coverage = Field(default_factory=Coverage)
    drivers: list[Driver] = Field(default_factory=list)
    #: "insufficient_data" when scored without enough evidence, "not_assessed"
    #: when no run has covered the area yet.
    missing_reason: str | None = None


class AssessmentResponse(BaseModel):
    geography_id: str
    name: str
    area_level_label: str | None
    run: RunSummary | None
    areas: list[AreaAssessment]


class AreaIndicator(BaseModel):
    code: str
    name: str
    component: str
    unit: str
    direction_to_risk: int
    raw: float | None = None
    vintage: str | None = None
    normalised: float | None = None
    weight: float | None = None
    contribution: float | None = None
    method: str | None = None
    source_name: str | None = None
    source_url: str | None = None
    quality_flags: dict = Field(default_factory=dict)
    excluded_reason: str | None = None


class AreaDetailResponse(BaseModel):
    area: AreaAssessment
    indicators: list[AreaIndicator]


class Rejection(BaseModel):
    row: int
    reason: str


class IngestionResult(BaseModel):
    ingestion_id: int
    status: str
    rows_accepted: int
    rows_rejected: int
    rejections: list[Rejection]


class IngestionItem(BaseModel):
    id: int
    status: str
    file_name: str | None
    rows_accepted: int
    rows_rejected: int
    rejections: list[Rejection]
    created_at: datetime
    requested_by: str | None


class CoverageIndicator(BaseModel):
    code: str
    name: str
    component: str
    unit: str
    route: str
    status: str
    uploadable: bool
    value_schema: ValueSchema
    #: Child areas holding at least one value for this indicator.
    present: int
    vintages: list[str]
    updated_at: datetime | None


class CoverageResponse(BaseModel):
    area_count: int
    indicators: list[CoverageIndicator]
    ingestions: list[IngestionItem]
