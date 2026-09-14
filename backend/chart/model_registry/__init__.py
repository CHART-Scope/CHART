"""Versioned model releases mapped to CHART places."""

from .service import get_active_model_mapping, register_model_release

__all__ = ["get_active_model_mapping", "register_model_release"]
