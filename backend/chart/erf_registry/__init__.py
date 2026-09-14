"""Publication of fitted exposure-response curves (`erf_parameters`).

The modeler produces a curve offline in R and hands it to CHART through
either the CLI or the internal HTTP endpoint. CHART stores the curve
and never fits.
"""

from .schemas import ErfParametersSpec
from .service import publish_erf_parameters

__all__ = ["ErfParametersSpec", "publish_erf_parameters"]
