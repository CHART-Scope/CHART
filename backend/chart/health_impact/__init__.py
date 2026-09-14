"""Bridge from a completed prediction to a persisted ``health_impact`` row.

Splits into two layers:
- :mod:`chart.health_impact.derivation` — pure math (OR to AF, AF x pop to
  attributable count), no session or model imports, easy to test.
- :mod:`chart.health_impact.materialize` — reads the active ERF and
  covariate rows, calls the pure math, and upserts a ``health_impact``
  row for the request grain the dashboard reads at.
"""

from .derivation import (
    attributable_fraction_milli,
    attributable_number,
    relative_risk_milli,
)
from .materialize import (
    ErfParametersNotFound,
    HealthImpactWriteResult,
    MaterializationInput,
    materialize_health_impact,
)

__all__ = [
    "ErfParametersNotFound",
    "HealthImpactWriteResult",
    "MaterializationInput",
    "attributable_fraction_milli",
    "attributable_number",
    "materialize_health_impact",
    "relative_risk_milli",
]
