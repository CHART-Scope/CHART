"""Request and response shapes for recommendations and their settings."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class RecommendationRequest(BaseModel):
    limit: int = Field(default=3, ge=1, le=10)


class RankedAction(BaseModel):
    id: str
    reasons: list[str]


class Insight(BaseModel):
    provider: str
    model: str | None
    text: str
    generated: bool
    note: str | None = None


class RecommendationResponse(BaseModel):
    ranker: str
    ranker_model: str | None = None
    ranker_note: str | None = None
    items: list[RankedAction]
    insight: Insight


class ProviderOption(BaseModel):
    id: str
    label: str
    available: bool
    reason: str | None = None


class RecommendationSettings(BaseModel):
    ranker: str = Field(default="rules", max_length=32)
    insight_provider: str = Field(default="template", max_length=32)
    insight_model: str | None = Field(default=None, max_length=200)


class RecommendationSettingsResponse(BaseModel):
    settings: RecommendationSettings
    rankers: list[ProviderOption]
    providers: list[ProviderOption]
    updated_by_user_id: str | None = None
    updated_at: datetime | None = None


class ProviderModels(BaseModel):
    provider: str
    models: list[str]
    source: Literal["provider", "configured", "none"]
