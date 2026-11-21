"""Read the action feed, keep the last good copy, resolve it per country.

``CHART_ACTIONS_URL`` names the feed; it defaults to the CHART project's public
file so a fresh checkout shows real actions with no account or key. Set it to
another URL to serve your own actions, or to an empty string to use only the
copy bundled with the package (``actions.json``).

An ``s3://bucket/key`` URL reads a private bucket with the server's AWS
credentials (the EC2 instance role; boto3, the ``bedrock`` extra). Its images
are stored as keys beside the feed (``images/<name>``) and each is served as
a link signed for an hour, so the bucket never needs to be public. A feed that cannot be read
or fails validation never replaces the last good copy; before any good read,
the bundled copy is served.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
import urllib.parse
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
#: How long a signed image link from a private bucket stays valid.
IMAGE_LINK_SECONDS = 3600

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
    items = [
        resolve(action, country)
        for action in feed.actions
        if country is None or not action.countries or country in action.countries
    ]
    url = os.getenv("CHART_ACTIONS_URL", DEFAULT_FEED_URL).strip()
    if source == "feed":
        items = [
            (
                _signed_images(item, url)
                if url.startswith("s3://")
                else _absolute_images(item, url)
            )
            for item in items
        ]
    return ActionList(
        country=country,
        source=source,
        published_at=feed.published_at,
        items=items,
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
    if url.startswith("s3://"):
        bucket, key = _s3_location(url)
        body = (
            _s3()
            .get_object(Bucket=bucket, Key=key, Range=f"bytes=0-{MAX_BYTES}")["Body"]
            .read()
        )
        if len(body) > MAX_BYTES:
            raise ValueError("action feed is larger than 5 MB")
        return ActionFeed.model_validate(json.loads(body))
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


def _signed_images(action: ActionContent, feed_url: str) -> ActionContent:
    """Relative image keys (``images/x.png``) as links signed for an hour."""

    if not any("://" not in image.url for image in action.images):
        return action
    bucket, key = _s3_location(feed_url)
    folder = key.rsplit("/", 1)[0] + "/" if "/" in key else ""
    images = [
        (
            image
            if "://" in image.url
            else image.model_copy(
                update={
                    "url": _s3().generate_presigned_url(
                        "get_object",
                        Params={"Bucket": bucket, "Key": folder + image.url},
                        ExpiresIn=IMAGE_LINK_SECONDS,
                    )
                }
            )
        )
        for image in action.images
    ]
    return action.model_copy(update={"images": images})


def _absolute_images(action: ActionContent, feed_url: str) -> ActionContent:
    """Relative image keys read from a public or file URL, beside the feed."""

    if all("://" in image.url for image in action.images):
        return action
    images = [
        image.model_copy(update={"url": urllib.parse.urljoin(feed_url, image.url)})
        for image in action.images
    ]
    return action.model_copy(update={"images": images})


def _s3_location(url: str) -> tuple[str, str]:
    bucket, _, key = url.removeprefix("s3://").partition("/")
    if not bucket or not key:
        raise ValueError(f"not an s3://bucket/key URL: {url}")
    return bucket, key


@lru_cache(maxsize=1)
def _s3():
    # boto3 is the core image's `bedrock` extra; a checkout without it can
    # still read public and file URLs.
    import boto3

    return boto3.client("s3")
