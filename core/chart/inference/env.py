"""Shared environment lookups for the LBW inference service.

Both the request path (:mod:`chart.inference.service`) and the artifact
warmer (:mod:`chart.model_registry.runtime`) reach the same R service;
keeping the env-var lookup in one place prevents them drifting when the
variable is renamed or deprecated.
"""

from __future__ import annotations

import os


def resolve_lbw_service_url(override: str | None = None) -> str:
    """Return the configured LBW service URL, or the empty string if unset."""

    if override is not None:
        return override
    return os.getenv("INFERENCE_LBW_BASE_URL", "")
