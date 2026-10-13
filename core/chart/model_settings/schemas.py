"""Shapes for per-country model settings."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# Where an option is used: the published Kenya outlook tables, or the live
# scorer behind planning requests.
OptionView = Literal["outlook", "live"]


class SettingOption(BaseModel):
    code: str
    label: str
    views: list[OptionView]


class AvailableOptions(BaseModel):
    """Everything the published tables and active model releases support."""

    selector_label: str
    selectors: list[SettingOption]
    scenarios: list[SettingOption]
    data_modes: list[SettingOption]


class ModelSettingsValues(BaseModel):
    """The options left on. Codes must come from the available options."""

    model_config = ConfigDict(extra="forbid")

    selectors: list[str] = Field(max_length=32)
    default_selector: str | None = Field(default=None, max_length=32)
    scenarios: list[str] = Field(max_length=32)
    default_scenario: str | None = Field(default=None, max_length=32)
    data_modes: list[str] = Field(max_length=8)


class ModelSettingsResponse(BaseModel):
    country_code: str
    country_name: str
    outcome: str
    available: AvailableOptions
    settings: ModelSettingsValues
    is_default: bool
    updated_by_user_id: str | None = None
    updated_at: datetime | None = None


class ModelSettingsListResponse(BaseModel):
    items: list[ModelSettingsResponse]
