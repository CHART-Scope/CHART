from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class LagWindowSpec(BaseModel):
    """Distributed-lag window applied by the exposure-response function.

    ``months`` is the ordered list of lag months (1..N). ``trimester_weights``
    is optional but, when provided, must have the same length and sum to
    ``1.000`` within a small epsilon.
    """

    model_config = ConfigDict(extra="forbid")

    months: list[int] = Field(min_length=1, max_length=12)
    trimester_weights: list[float] | None = None

    @field_validator("months")
    @classmethod
    def _months_positive_and_unique(cls, months: list[int]) -> list[int]:
        if any(month < 1 for month in months):
            raise ValueError("ERF_LAG_MONTH_MUST_BE_POSITIVE")
        if len(set(months)) != len(months):
            raise ValueError("ERF_LAG_MONTH_DUPLICATE")
        return months

    @model_validator(mode="after")
    def _weights_align_with_months(self) -> LagWindowSpec:
        weights = self.trimester_weights
        if weights is None:
            return self
        if len(weights) != len(self.months):
            raise ValueError("ERF_LAG_WEIGHTS_LENGTH_MISMATCH")
        if any(w < 0 for w in weights):
            raise ValueError("ERF_LAG_WEIGHT_NEGATIVE")
        total = sum(weights)
        if abs(total - 1.0) > 1e-3:
            raise ValueError("ERF_LAG_WEIGHTS_MUST_SUM_TO_ONE")
        return self


class ErfParametersSpec(BaseModel):
    """Wire-format spec for one exposure-response curve publication.

    ``geography_slug`` uses the human-readable identifier already used
    throughout the API rather than the internal integer id, so the
    modeler never has to look up ids.
    """

    model_config = ConfigDict(extra="forbid")

    geography_slug: str = Field(min_length=1, max_length=64)
    outcome: str = Field(min_length=1, max_length=64)
    spline_coefficients: dict[str, Any] = Field(min_length=1)
    lag_window: LagWindowSpec
    reference_percentile: float = Field(ge=0.0, le=100.0)
    projection_source: str | None = Field(default=None, max_length=128)
    git_ref: str = Field(min_length=1, max_length=128)
    notes: str | None = None

    @property
    def reference_percentile_milli(self) -> int:
        return round(self.reference_percentile * 1000)


class ErfParametersPublished(BaseModel):
    """Response shape confirming a publication (or an idempotent hit)."""

    id: int
    geography_slug: str
    outcome: str
    git_ref: str
    reference_percentile: float
    created: bool
