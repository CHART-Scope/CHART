"""Read the public action feed, keep the last good copy, resolve it per country.

``CHART_ACTIONS_URL`` names the feed; it defaults to the CHART project's public
file so a fresh checkout shows real actions with no account or key. Set it to
another URL to serve your own actions, or to an empty string to use only the
copy bundled with the package (``actions.json``). A feed that cannot be read
or fails validation never replaces the last good copy; before any good read,
the bundled copy is served.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
import urllib.request
from functools import lru_cache
from pathlib import Path

from pydantic import ValidationError

from .schemas import ActionContent, ActionFeed, ActionList, FeedAction, FeedSource

DEFAULT_FEED_URL = (
    "https://chart-actions-repository.s3.eu-north-1.amazonaws.com/v1/actions.json"
)
BUNDLED_PATH = Path(__file__).with_name("actions.json")
MAX_BYTES = 5 * 1024 * 1024

logger = logging.getLogger(__name__)
_lock = threading.Lock()
# (checked_at, feed, source) of the last good read.
_cache: tuple[float, ActionFeed, FeedSource] | None = None


def load_feed() -> tuple[ActionFeed, FeedSource]:
    """The current feed and whether it is the remote ``feed`` or ``bundled``."""

    global _cache
    url = os.getenv("CHART_ACTIONS_URL", DEFAULT_FEED_URL).strip()
    if not url:
        return _bundled(), "bundled"
    ttl = float(os.getenv("CHART_ACTIONS_CACHE_SECONDS", "300"))
    now = time.monotonic()
    with _lock:
        if _cache is not None and now - _cache[0] < ttl:
            return _cache[1], _cache[2]
    try:
        feed = _fetch(url)
    except (OSError, ValueError, ValidationError) as exc:
        logger.warning("Action feed %s unavailable (%s); keeping last good", url, exc)
        with _lock:
            # Retry after the TTL, not on every request, while the feed is down.
            _cache = (now, *(_cache[1:] if _cache else (_bundled(), "bundled")))
            return _cache[1], _cache[2]
    with _lock:
        _cache = (now, feed, "feed")
    return feed, "feed"


def list_actions(country: str | None) -> ActionList:
    feed, source = load_feed()
    return ActionList(
        country=country,
        source=source,
        published_at=feed.published_at,
        items=[
            resolve(action, country)
            for action in feed.actions
            if country is None or not action.countries or country in action.countries
        ],
    )


def resolve(action: FeedAction, country: str | None) -> ActionContent:
    """The action as read in ``country``: its own wording where it has some."""

    content = action.model_dump(exclude={"countries", "by_country"})
    local = action.by_country.get(country or "")
    if local is not None:
        content.update(
            {field: value for field, value in local.model_dump().items() if value}
        )
    return ActionContent.model_validate(content)


def _fetch(url: str) -> ActionFeed:
    request = urllib.request.Request(url, headers={"User-Agent": "CHART"})
    timeout = float(os.getenv("CHART_ACTIONS_TIMEOUT_SECONDS", "5"))
    with urllib.request.urlopen(request, timeout=timeout) as response:
        body = response.read(MAX_BYTES + 1)
    if len(body) > MAX_BYTES:
        raise ValueError("action feed is larger than 5 MB")
    return ActionFeed.model_validate(json.loads(body))


@lru_cache(maxsize=1)
def _bundled() -> ActionFeed:
    return ActionFeed.model_validate_json(BUNDLED_PATH.read_bytes())
