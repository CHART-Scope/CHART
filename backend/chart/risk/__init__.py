"""Read routes serving the Short-term and Long-term dashboard panels.

Reads ``health_impact`` rows precomputed by
:mod:`chart.health_impact.materialize`. No ingestion or fitting happens
here.
"""

from .service import (
    NoAdminUnitForGeography,
    load_long_term_view,
    load_short_term_view,
)

__all__ = [
    "NoAdminUnitForGeography",
    "load_long_term_view",
    "load_short_term_view",
]
