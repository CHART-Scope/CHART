"""The public action feed (schema version 1) and the API's view of it.

The feed is the contract between whoever curates actions (the publisher in
``publish.py``, or anyone running their own CHART) and the app. It carries
only reviewed, published, non-personal content; ``extra="forbid"`` makes a
field nobody allowed fail validation instead of reaching a public file.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Season = Literal["before", "during", "after"]
CostLevel = Literal["No additional cost", "Low", "Medium", "High", "Variable"]
FeedSource = Literal["feed", "bundled"]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Reference(Strict):
    citation: str = Field(min_length=1)
    url: str | None = None


class Image(Strict):
    url: str
    filename: str


class CountryText(Strict):
    """Country wording that replaces the generic text when a place is known."""

    description: str = ""
    rationale: str = ""
    cost_reasoning: str = ""
    departments: list[str] = []
    stakeholders: list[str] = []


class ActionContent(Strict):
    id: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=300)
    summary: str = ""
    description: str = ""
    hazards: list[str] = []
    health_outcomes: list[str] = []
    target_populations: list[str] = []
    action_types: list[str] = []
    levels: list[str] = []
    seasons: list[Season] = []
    departments: list[str] = []
    stakeholders: list[str] = []
    cost_level: CostLevel | None = None
    cost_reasoning: str = ""
    rationale: str = ""
    expected_outcomes: str = ""
    decision_trigger: str = ""
    trigger_sources: list[str] = []
    references: list[Reference] = []
    case_studies: list[Reference] = []
    images: list[Image] = []


class FeedAction(ActionContent):
    # Empty means every country; otherwise ISO 3166-1 alpha-2 codes.
    countries: list[str] = []
    by_country: dict[str, CountryText] = {}


class ActionFeed(Strict):
    schema_version: Literal[1]
    published_at: datetime
    source: str
    actions: list[FeedAction]


class ActionList(BaseModel):
    """Actions for one country (or all, generic wording) and where they came from."""

    country: str | None
    source: FeedSource
    published_at: datetime
    items: list[ActionContent]
