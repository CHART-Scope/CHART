"""Learning Hub: the curated climate-and-health resource catalogue.

Reads ``learning_resource`` / ``learning_track`` rows seeded from
``seed.json`` at installation setup, and the per-user ``learning_progress``
and ``learning_preference`` rows written by the player. Browsing is public;
only the personalised views require a session.
"""

from .service import (
    ResourceFilters,
    ResourceNotFound,
    load_personal_view,
    load_resources,
    load_taxonomies,
    load_tracks,
    save_preferences,
    save_progress,
)

__all__ = [
    "ResourceFilters",
    "ResourceNotFound",
    "load_personal_view",
    "load_resources",
    "load_taxonomies",
    "load_tracks",
    "save_preferences",
    "save_progress",
]
