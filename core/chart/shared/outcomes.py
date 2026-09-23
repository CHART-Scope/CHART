"""The health-outcome vocabulary.

An outcome code identifies what a model predicts - low birth weight,
under-five mortality. The codes are declared by the model manifests and
flow from there into ``model_release``, ``active_model_assignment`` and
every prediction request, so the manifest is the source of truth and this
module only names the default.

There is deliberately no enum here. Adding an outcome must mean shipping a
manifest, not editing a list in the backend; an enum would make the backend
the gatekeeper of something the modelling team owns. What this module does
prevent is the previous state, where fifteen call sites each wrote the
literal ``"lbw"`` and one of them silently made the monthly dashboard
low-birth-weight-only regardless of what the user selected.
"""

from __future__ import annotations

# The outcome assumed when a caller does not name one. Historically every
# request was low birth weight, and the API keeps that default so existing
# clients are unaffected.
DEFAULT_OUTCOME = "lbw"
