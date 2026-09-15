"""Behaviour for the Learning Hub catalogue, pathway, and personal view."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from chart.shared.db.models import (
    AppGeography,
    LearningPreferenceRecord,
    LearningProgressRecord,
    LearningResource,
    LearningTrack,
)

from .schemas import (
    PersonalViewResponse,
    ProgressItem,
    Recommendation,
    ResourceItem,
    TaxonomyResponse,
    TaxonomyTerm,
    TrackSummary,
)

DEFAULT_LIMIT = 60
MAX_LIMIT = 200
RECOMMENDATION_COUNT = 6

# A resource counts as watched once the viewer has seen most of it. Anything
# shorter than this is "in progress" and can be resumed.
COMPLETION_RATIO = 0.9


class ResourceNotFound(Exception):
    """Raised when a slug does not match a published resource."""


@dataclass
class ResourceFilters:
    """Facet selections from the query string. Empty means "no constraint"."""

    tracks: list[str] = field(default_factory=list)
    kinds: list[str] = field(default_factory=list)
    languages: list[str] = field(default_factory=list)
    countries: list[str] = field(default_factory=list)
    outcomes: list[str] = field(default_factory=list)
    max_minutes: int | None = None
    # The hub opens on the curated shortlist; ``include=all`` widens it.
    featured_only: bool = True
    search: str | None = None


def _slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def _published(session: Session) -> list[LearningResource]:
    rows = session.scalars(
        select(LearningResource)
        .where(LearningResource.is_published.is_(True))
        .order_by(
            LearningResource.sort_weight.desc(),
            LearningResource.title,
        )
    )
    return list(rows)


def _matches(resource: LearningResource, filters: ResourceFilters) -> bool:
    if filters.featured_only and not resource.is_featured:
        return False
    if filters.tracks and not set(filters.tracks) & set(resource.tracks or []):
        return False
    if filters.kinds and resource.kind not in filters.kinds:
        return False
    if filters.languages:
        wanted = {value.lower() for value in filters.languages}
        have = {value.lower() for value in resource.languages or []}
        if not wanted & have:
            return False
    if filters.countries:
        wanted = {value.lower() for value in filters.countries}
        have = {value.lower() for value in resource.countries or []}
        if not wanted & have:
            return False
    if filters.outcomes:
        wanted = {value.lower() for value in filters.outcomes}
        have = {value.lower() for value in resource.health_outcomes or []}
        if not wanted & have:
            return False
    if filters.max_minutes is not None:
        seconds = resource.duration_seconds
        # Unknown-length rows are excluded from a "how long have you got"
        # filter rather than assumed short.
        if seconds is None or seconds > filters.max_minutes * 60:
            return False
    if filters.search:
        needle = filters.search.lower()
        haystack = " ".join(
            [
                resource.title,
                resource.provider,
                resource.objectives,
                resource.audience_summary,
                resource.location_label,
                " ".join(resource.tags or []),
                " ".join(resource.health_outcomes or []),
            ]
        ).lower()
        if needle not in haystack:
            return False
    return True


def load_resources(
    session: Session,
    *,
    filters: ResourceFilters | None = None,
    limit: int = DEFAULT_LIMIT,
) -> tuple[list[ResourceItem], int]:
    """Return matching published resources and the unpaged match count."""

    filters = filters or ResourceFilters()
    matched = [row for row in _published(session) if _matches(row, filters)]
    capped = max(1, min(limit, MAX_LIMIT))
    return [ResourceItem.model_validate(row) for row in matched[:capped]], len(matched)


def load_tracks(session: Session) -> list[TrackSummary]:
    """Pathway stops in curriculum order, with their resource counts."""

    resources = _published(session)
    counts: dict[str, int] = {}
    for resource in resources:
        for slug in resource.tracks or []:
            counts[slug] = counts.get(slug, 0) + 1

    tracks = session.scalars(select(LearningTrack).order_by(LearningTrack.position))
    return [
        TrackSummary(
            slug=track.slug,
            title=track.title,
            summary=track.summary,
            position=track.position,
            resource_count=counts.get(track.slug, 0),
        )
        for track in tracks
    ]


def load_taxonomies(
    session: Session, *, featured_only: bool = True
) -> TaxonomyResponse:
    """Derive the facet vocabulary from the resources themselves.

    Nothing here is stored: the same approach the solution repository takes,
    so a reseed cannot leave an orphaned vocabulary behind.
    """

    buckets: dict[tuple[str, str], int] = {}

    def add(kind: str, label: str) -> None:
        label = label.strip()
        if not label:
            return
        buckets[(kind, label)] = buckets.get((kind, label), 0) + 1

    track_titles = {
        track.slug: track.title for track in session.scalars(select(LearningTrack))
    }

    for resource in _published(session):
        if featured_only and not resource.is_featured:
            continue
        add("kind", resource.kind)
        for slug in resource.tracks or []:
            add("track", track_titles.get(slug, slug))
        for language in resource.languages or []:
            add("language", language)
        for country in resource.countries or []:
            add("country", country)
        for outcome in resource.health_outcomes or []:
            add("health_outcome", outcome)
        for tag in resource.tags or []:
            add("tag", tag)
        if resource.format_label:
            add("format", resource.format_label)

    terms = [
        TaxonomyTerm(
            id=f"{kind}-{_slugify(label)}", type=kind, label=label, count=count
        )
        for (kind, label), count in buckets.items()
    ]
    terms.sort(key=lambda term: (term.type, -term.count, term.label))
    return TaxonomyResponse(terms=terms)


def user_countries(session: Session, geography_ids: list[str]) -> list[str]:
    """Country names behind a user's geography scope, for ranking by place."""

    if not geography_ids:
        return []
    scoped = session.scalars(
        select(AppGeography).where(AppGeography.id.in_(geography_ids))
    )
    codes = {row.country_code for row in scoped}
    if not codes:
        return []
    # The country-level row carries the display name the catalogue uses.
    countries = session.scalars(
        select(AppGeography).where(
            AppGeography.country_code.in_(codes),
            AppGeography.level == "country",
        )
    )
    return sorted({row.name for row in countries})


def _score(
    resource: LearningResource,
    *,
    countries: list[str],
    audience_id: str | None,
    interested: list[str],
    watched: set[int],
) -> tuple[int, str]:
    """Rank one resource and explain, in one phrase, why it scored."""

    score = resource.sort_weight
    reason = "Recommended for you"

    country_hit = next(
        (
            name
            for name in countries
            if name.lower() in {value.lower() for value in resource.countries or []}
        ),
        None,
    )
    if country_hit:
        score += 100
        reason = f"Because you work in {country_hit}"

    # Whole-token match: a bare substring lets "lead" score against
    # "leadership" and "team-leads", quietly distorting the ranking.
    audience_hit = bool(
        audience_id
        and re.search(
            rf"(^|-){re.escape(audience_id)}(-|$)",
            _slugify(resource.audience_summary),
        )
    )
    if audience_hit:
        score += 50
        if not country_hit:
            reason = "Matches the work you do"

    if interested and set(interested) & set(resource.tracks or []):
        score += 30
        # Gate on whether the audience actually scored, not on whether the
        # user happens to have one set.
        if not country_hit and not audience_hit:
            reason = "Next on your pathway"

    if resource.id not in watched:
        score += 20

    # Nudge shorter items up: they are likelier to actually get watched.
    if resource.duration_seconds and resource.duration_seconds <= 600:
        score += 10

    if resource.kind == "video":
        score += 15

    return score, reason


def load_personal_view(
    session: Session,
    *,
    user_id: str,
    geography_ids: list[str],
) -> PersonalViewResponse:
    """Preferences, progress, pathway completion, and ranked suggestions."""

    preference = session.get(LearningPreferenceRecord, user_id)
    audience_id = preference.audience_id if preference else None
    interested = list(preference.interested_track_slugs) if preference else []

    progress_rows = list(
        session.scalars(
            select(LearningProgressRecord)
            .where(LearningProgressRecord.user_id == user_id)
            .order_by(LearningProgressRecord.last_seen_at.desc())
        )
    )
    by_resource = {row.resource_id: row for row in progress_rows}

    resources = _published(session)
    by_id = {row.id: row for row in resources}
    completed_ids = {
        row.resource_id for row in progress_rows if row.completed_at is not None
    }

    progress = [
        ProgressItem(
            slug=by_id[row.resource_id].slug,
            seconds_watched=row.seconds_watched,
            completed=row.completed_at is not None,
            last_seen_at=row.last_seen_at,
        )
        for row in progress_rows
        if row.resource_id in by_id
    ]

    tracks = load_tracks(session)
    for track in tracks:
        track.completed_count = sum(
            1
            for resource in resources
            if track.slug in (resource.tracks or []) and resource.id in completed_ids
        )

    # The most recent partly-watched item is the one worth resuming.
    resume: Recommendation | None = None
    for row in progress_rows:
        resource = by_id.get(row.resource_id)
        if resource is None or row.completed_at is not None:
            continue
        if not resource.duration_seconds:
            continue
        if row.seconds_watched >= resource.duration_seconds * COMPLETION_RATIO:
            continue
        remaining = max(1, (resource.duration_seconds - row.seconds_watched) // 60)
        resume = Recommendation(
            item=ResourceItem.model_validate(resource),
            reason=f"{remaining} min left",
        )
        break

    watched = set(by_resource)
    countries = user_countries(session, geography_ids)
    ranked = sorted(
        (
            (
                _score(
                    resource,
                    countries=countries,
                    audience_id=audience_id,
                    interested=interested,
                    watched=watched,
                ),
                resource,
            )
            for resource in resources
            if resource.id not in completed_ids
        ),
        key=lambda pair: (-pair[0][0], pair[1].title),
    )

    recommendations = [
        Recommendation(item=ResourceItem.model_validate(resource), reason=reason)
        for (_, reason), resource in ranked[:RECOMMENDATION_COUNT]
    ]

    return PersonalViewResponse(
        audience_id=audience_id,
        interested_track_slugs=interested,
        tracks=tracks,
        progress=progress,
        continue_watching=resume,
        recommendations=recommendations,
    )


def save_preferences(
    session: Session,
    *,
    user_id: str,
    audience_id: str | None,
    interested_track_slugs: list[str],
) -> None:
    """Upsert one user's self-declared role and pathway interests."""

    known = {track.slug for track in session.scalars(select(LearningTrack))}
    cleaned = [slug for slug in interested_track_slugs if slug in known]

    record = session.get(LearningPreferenceRecord, user_id)
    if record is None:
        session.add(
            LearningPreferenceRecord(
                user_id=user_id,
                audience_id=audience_id,
                interested_track_slugs=cleaned,
            )
        )
    else:
        record.audience_id = audience_id
        record.interested_track_slugs = cleaned
        record.updated_at = datetime.now(timezone.utc)
    session.commit()


def save_progress(
    session: Session,
    *,
    user_id: str,
    slug: str,
    seconds_watched: int,
    completed: bool,
) -> ProgressItem:
    """Record how far a user got, keeping the furthest point reached."""

    resource = session.scalar(
        select(LearningResource).where(
            LearningResource.slug == slug,
            LearningResource.is_published.is_(True),
        )
    )
    if resource is None:
        raise ResourceNotFound(slug)

    now = datetime.now(timezone.utc)
    done = completed or (
        resource.duration_seconds is not None
        and seconds_watched >= resource.duration_seconds * COMPLETION_RATIO
    )

    record = session.get(LearningProgressRecord, (user_id, resource.id))
    if record is None:
        record = LearningProgressRecord(
            user_id=user_id,
            resource_id=resource.id,
            seconds_watched=seconds_watched,
            completed_at=now if done else None,
            last_seen_at=now,
        )
        session.add(record)
    else:
        record.seconds_watched = max(record.seconds_watched, seconds_watched)
        record.last_seen_at = now
        if done and record.completed_at is None:
            record.completed_at = now
    session.commit()

    return ProgressItem(
        slug=resource.slug,
        seconds_watched=record.seconds_watched,
        completed=record.completed_at is not None,
        last_seen_at=record.last_seen_at,
    )
