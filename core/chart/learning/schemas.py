from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class ResourceItem(BaseModel):
    """One catalogue entry, shaped for a card in the Learning Hub grid."""

    model_config = ConfigDict(from_attributes=True)

    slug: str
    url: str
    canonical_url: str
    youtube_id: str | None
    kind: str
    title: str
    provider: str
    objectives: str
    audience_summary: str
    location_label: str
    countries: list[str]
    languages: list[str]
    # ``None`` where the source sheet recorded no length; the card omits the
    # duration pill rather than guessing.
    duration_seconds: int | None
    duration_label: str | None
    format_label: str
    published_on: date | None
    access_label: str
    # Only ``embeddable`` may be played inline. Everything else is an
    # outbound link, because permission to reframe it was never confirmed.
    embed_status: str
    tracks: list[str]
    tags: list[str]
    health_outcomes: list[str]
    is_featured: bool


class TrackSummary(BaseModel):
    """One stop on the pathway, with how much of it the caller has watched."""

    model_config = ConfigDict(from_attributes=True)

    slug: str
    title: str
    summary: str
    position: int
    resource_count: int = 0
    completed_count: int = 0


class TaxonomyTerm(BaseModel):
    """A derived facet value and how many published resources carry it."""

    id: str
    type: str
    label: str
    count: int


class TaxonomyResponse(BaseModel):
    terms: list[TaxonomyTerm]


class ResourceListResponse(BaseModel):
    items: list[ResourceItem]
    total: int


class TrackListResponse(BaseModel):
    tracks: list[TrackSummary]


class ProgressItem(BaseModel):
    slug: str
    seconds_watched: int
    completed: bool
    last_seen_at: datetime


class Recommendation(BaseModel):
    """A ranked suggestion plus the human-readable reason it was picked."""

    item: ResourceItem
    reason: str


class PersonalViewResponse(BaseModel):
    audience_id: str | None
    interested_track_slugs: list[str]
    tracks: list[TrackSummary]
    progress: list[ProgressItem]
    continue_watching: Recommendation | None
    recommendations: list[Recommendation]


class PreferencesRequest(BaseModel):
    audience_id: str | None = Field(default=None, max_length=64)
    interested_track_slugs: list[str] = Field(default_factory=list, max_length=32)


class ProgressRequest(BaseModel):
    slug: str = Field(max_length=160)
    seconds_watched: int = Field(ge=0, le=60 * 60 * 24)
    completed: bool = False
