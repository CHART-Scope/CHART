"""Public read of the recommended actions; no sign-in, like the feed itself."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from starlette.concurrency import run_in_threadpool

from chart.shared.db.models import AppGeography
from chart.shared.db.session import get_session_factory

from .feed import list_actions
from .schemas import ActionList

router = APIRouter(tags=["actions"])


@router.get("/actions", response_model=ActionList)
async def read_actions(
    geography: Annotated[str | None, Query(max_length=128)] = None,
) -> ActionList:
    """Every published action, or those for a place's country in its wording."""

    country = await run_in_threadpool(_country_of, geography) if geography else None
    # The first read (or a refresh) fetches the feed over HTTP.
    return await run_in_threadpool(list_actions, country)


def _country_of(geography_id: str) -> str:
    with get_session_factory()() as session:
        place = session.get(AppGeography, geography_id)
    if place is None:
        raise HTTPException(status_code=404, detail="GEOGRAPHY_NOT_FOUND")
    return place.country_code
