"""HTTP endpoints for the Learning Hub catalogue and a user's pathway."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from chart.auth.schemas import CurrentUserContext
from chart.auth.service import require_current_user
from chart.shared.db.session import get_session_factory

from .schemas import (
    PersonalViewResponse,
    PreferencesRequest,
    ProgressItem,
    ProgressRequest,
    ResourceListResponse,
    TaxonomyResponse,
    TrackListResponse,
)
from .service import (
    DEFAULT_LIMIT,
    MAX_LIMIT,
    ResourceFilters,
    ResourceNotFound,
    load_personal_view,
    load_resources,
    load_taxonomies,
    load_tracks,
    save_preferences,
    save_progress,
)

router = APIRouter(prefix="/learning", tags=["learning"])


@router.get("/resources", response_model=ResourceListResponse)
def list_resources(
    track: Annotated[list[str] | None, Query()] = None,
    kind: Annotated[list[str] | None, Query()] = None,
    language: Annotated[list[str] | None, Query()] = None,
    country: Annotated[list[str] | None, Query()] = None,
    outcome: Annotated[list[str] | None, Query()] = None,
    max_minutes: Annotated[int | None, Query(ge=1, le=600)] = None,
    search: Annotated[str | None, Query(max_length=200)] = None,
    include: Annotated[str, Query(pattern="^(featured|all)$")] = "featured",
    limit: Annotated[int, Query(ge=1, le=MAX_LIMIT)] = DEFAULT_LIMIT,
) -> ResourceListResponse:
    filters = ResourceFilters(
        tracks=track or [],
        kinds=kind or [],
        languages=language or [],
        countries=country or [],
        outcomes=outcome or [],
        max_minutes=max_minutes,
        featured_only=include == "featured",
        search=search,
    )
    with get_session_factory()() as session:
        items, total = load_resources(session, filters=filters, limit=limit)
    return ResourceListResponse(items=items, total=total)


@router.get("/taxonomies", response_model=TaxonomyResponse)
def list_taxonomies(
    include: Annotated[str, Query(pattern="^(featured|all)$")] = "featured",
) -> TaxonomyResponse:
    with get_session_factory()() as session:
        return load_taxonomies(session, featured_only=include == "featured")


@router.get("/tracks", response_model=TrackListResponse)
def list_tracks() -> TrackListResponse:
    with get_session_factory()() as session:
        return TrackListResponse(tracks=load_tracks(session))


@router.get("/me", response_model=PersonalViewResponse)
def read_personal_view(
    user: Annotated[CurrentUserContext, Depends(require_current_user)],
) -> PersonalViewResponse:
    scopes = list(user.geography_scopes)
    if user.active_geography_id:
        scopes.append(user.active_geography_id)
    with get_session_factory()() as session:
        return load_personal_view(session, user_id=user.user_id, geography_ids=scopes)


@router.put("/me/preferences", response_model=PersonalViewResponse)
def update_preferences(
    payload: PreferencesRequest,
    user: Annotated[CurrentUserContext, Depends(require_current_user)],
) -> PersonalViewResponse:
    scopes = list(user.geography_scopes)
    if user.active_geography_id:
        scopes.append(user.active_geography_id)
    with get_session_factory()() as session:
        save_preferences(
            session,
            user_id=user.user_id,
            audience_id=payload.audience_id,
            interested_track_slugs=payload.interested_track_slugs,
        )
        return load_personal_view(session, user_id=user.user_id, geography_ids=scopes)


@router.put("/me/progress", response_model=ProgressItem)
def update_progress(
    payload: ProgressRequest,
    user: Annotated[CurrentUserContext, Depends(require_current_user)],
) -> ProgressItem:
    with get_session_factory()() as session:
        try:
            return save_progress(
                session,
                user_id=user.user_id,
                slug=payload.slug,
                seconds_watched=payload.seconds_watched,
                completed=payload.completed,
            )
        except ResourceNotFound as error:
            raise HTTPException(
                status_code=404, detail="LEARNING_RESOURCE_NOT_FOUND"
            ) from error
