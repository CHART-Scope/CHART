from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .catalog import ClimateLocationSlug, ClimateTimeframeId

PredictionStatus = Literal["queued", "running", "completed", "failed"]
AvailabilityStatus = Literal["ready", "partial", "missing", "stale", "not_available"]
PredictionStage = Literal[
    "queued",
    "preparing_climate",
    "predicting",
    "completed",
    "failed",
]


class LbwOutcome(BaseModel):
    """Optional health outcome to score after climate data is available."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {"type": "lbw", "trimester": 1, "area": "Madhya Pradesh"},
                {"type": "lbw", "trimester": 1, "area": "Gwalior", "ref": 27.0},
            ]
        }
    )

    type: Literal["lbw"] = Field(
        description="Health outcome model to run. Only `lbw` is supported today."
    )
    trimester: Literal[1, 2, 3] = Field(
        description=(
            "Pregnancy trimester window for the LBW model. "
            "1 = latest trimester (T3), 2 = middle (T2), 3 = earliest (T1)."
        )
    )
    area: str | None = Field(
        default=None,
        description=(
            "LBW geography within Madhya Pradesh. Use `Madhya Pradesh` for the state model "
            "or a division name (e.g. `Gwalior`). Defaults to whole state."
        ),
        examples=["Madhya Pradesh", "Gwalior"],
    )
    ref: float | None = Field(
        default=None,
        description="Reference temperature in °C. Omit to use the model default for the chosen area.",
        examples=[27.0],
    )


class PreviewRequest(BaseModel):
    """Check whether observed climate data exists for a location and timeframe."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {"location_slug": "madhya-pradesh", "timeframe_id": "exposure_3m"},
                {
                    "location_slug": "kajiado",
                    "timeframe_id": "recent_12m",
                    "end_month": "2024-12",
                },
            ]
        }
    )

    location_slug: ClimateLocationSlug = Field(
        description="Geography preset slug. Must be one of the supported MVP locations.",
        examples=["madhya-pradesh", "kajiado"],
    )
    timeframe_id: ClimateTimeframeId = Field(
        description=(
            "Standard timeframe. Use `exposure_3m` for LBW prediction; "
            "`seasonal` and `projection` are catalogued but not ingested yet."
        ),
        examples=[
            "exposure_3m",
            "recent_12m",
            "historical_window",
            "seasonal",
            "projection",
        ],
    )
    end_month: str | None = Field(
        default=None,
        pattern=r"^\d{4}-\d{2}$",
        description=(
            "Optional anchor month (`YYYY-MM`). The API walks backward from this month "
            "for rolling windows. Defaults to the latest month stored in Postgres."
        ),
        examples=["2024-12"],
    )


class PredictRequest(PreviewRequest):
    """Preview climate coverage and optionally run an LBW prediction."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "location_slug": "madhya-pradesh",
                    "timeframe_id": "exposure_3m",
                    "outcome": {"type": "lbw", "trimester": 1},
                }
            ]
        }
    )

    outcome: LbwOutcome | None = Field(
        default=None,
        description=(
            "When set to `lbw`, the API uses the last three monthly mean temperatures "
            "from Postgres and calls the LBW inference service. Omit for preview-only."
        ),
    )


class MonthValue(BaseModel):
    month: str = Field(description="Calendar month (`YYYY-MM`).", examples=["2024-12"])
    tmax_monthly_mean_c: float = Field(
        description="Monthly mean of daily maximum 2 m temperature (°C) for the admin bbox.",
        examples=[29.1],
    )


class Availability(BaseModel):
    location_slug: ClimateLocationSlug
    timeframe_id: ClimateTimeframeId
    status: AvailabilityStatus = Field(
        description=(
            "`ready` = enough months for the request; `partial`/`missing` = ingest or widen window; "
            "`stale` = data older than monthly cadence; `not_available` = tier not built yet."
        )
    )
    months_requested: int = Field(description="Months needed for this timeframe.")
    months_found: int = Field(
        description="Months found in `district_climate` for the request."
    )
    missing_months: list[str] = Field(
        description="Requested months with no stored value."
    )
    period_start: str | None = Field(
        description="First month returned in `series`, if any."
    )
    period_end: str | None = Field(
        description="Last month returned in `series`, if any."
    )
    last_refreshed_at: str | None = Field(
        description="ISO timestamp from `data_source.last_refreshed_at` for this geography."
    )
    climate_run_id: int | None = Field(
        description="Postgres `climate_run.id` backing the series."
    )
    data_label: str | None = Field(
        description="Provenance label for the run (`sample`, `reanalysis`, etc.)."
    )
    pull_required: bool = Field(
        description="When true, run the suggested materialisation command before predicting."
    )
    pull_hint: str | None = Field(
        description="Shell hint to refresh data, e.g. `PRESET=madhya-pradesh make climate-materialize`.",
        examples=["PRESET=madhya-pradesh make climate-materialize"],
    )


class LocationResponse(BaseModel):
    slug: ClimateLocationSlug
    name: str
    country: str
    level: str = Field(
        description="Admin level for the MVP bbox unit (`state`, `county`, …)."
    )
    supports_lbw_prediction: bool = Field(
        description="Whether the LBW inference bridge is available for this location."
    )
    lbw_areas: list[str] = Field(
        default_factory=list,
        description="LBW model areas when `supports_lbw_prediction` is true (MP state + divisions).",
    )


class TimeframeResponse(BaseModel):
    id: ClimateTimeframeId
    label: str
    description: str
    horizon: Literal["short", "medium", "long"] = Field(
        description="User-facing horizon group: short = observed monthly, medium = seasonal, long = projection."
    )
    resolution: str = Field(
        description="Native resolution for the tier (`monthly`, `seasonal`, `annual`)."
    )
    month_count: int | None = Field(
        description="Rolling month window when applicable. `null` means use the full ingested window."
    )
    tier: Literal["observed", "seasonal", "projection"]


class PreviewResponse(BaseModel):
    location: LocationResponse
    timeframe: TimeframeResponse
    availability: Availability
    series: list[MonthValue] = Field(
        description="Monthly temperature series for the requested timeframe (may be empty)."
    )


class LbwPrediction(BaseModel):
    area: str
    geography_level: str = Field(
        description="`state` or `division` in the LBW model bundle."
    )
    trimester: int
    tmax_lag: list[float] = Field(
        description="Three monthly mean temperatures in °C, most recent month first (lag0, lag1, lag2)."
    )
    ref_temp: float = Field(
        description="Reference temperature in °C used for the odds ratio."
    )
    odds_ratio: float = Field(
        description="Modelled odds ratio vs the reference temperature profile."
    )
    ci95_low: float
    ci95_high: float
    on_training_support: bool = Field(
        description="Whether all supplied temperatures fall within the model training range."
    )
    model_file: str = Field(description="LBW model bundle filename used for scoring.")


class PredictResponse(PreviewResponse):
    prediction: LbwPrediction | None = Field(
        default=None,
        description="LBW result when `outcome.type=lbw` and climate data is ready.",
    )
    prediction_note: str | None = Field(
        default=None,
        description="Human-readable note when no outcome was requested or prediction was skipped.",
    )
    request_id: int | None = Field(
        default=None,
        description="Durable prediction request id when this result was persisted.",
    )
    request_status: PredictionStatus | None = Field(
        default=None,
        description=(
            "Background state when a persisted prediction request is associated "
            "with the result."
        ),
    )


class PredictionAcceptedResponse(BaseModel):
    request_id: int
    status: Literal["queued", "running"]
    stage: PredictionStage
    location_slug: ClimateLocationSlug
    timeframe_id: ClimateTimeframeId
    status_url: str
    message: str


class PredictionRequestStatusResponse(BaseModel):
    request_id: int
    status: PredictionStatus
    stage: PredictionStage
    location_slug: ClimateLocationSlug
    timeframe_id: ClimateTimeframeId
    dagster_run_id: str | None = None
    error_code: str | None = None
    result: PredictResponse | None = None
    created_at: str
    updated_at: str


class LocationListResponse(BaseModel):
    items: list[LocationResponse]


class TimeframeListResponse(BaseModel):
    items: list[TimeframeResponse]


class ErrorResponse(BaseModel):
    error: str = Field(
        description="Stable machine-readable error code.",
        examples=["CLIMATE_DATA_NOT_READY", "LBW_NOT_AVAILABLE_FOR_LOCATION"],
    )


class HealthResponse(BaseModel):
    status: Literal["ok"] = Field(description="Service health status.")
