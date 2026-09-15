from __future__ import annotations

from typing import Protocol

from .service import LbwScore
from .providers.openai_compatible import configured_explainer


class PredictionExplainer(Protocol):
    """Optional small-model explanation; it never changes the numeric result."""

    def explain(self, score: LbwScore) -> str: ...


def explain_if_configured(
    score: LbwScore, provider: PredictionExplainer | None = None
) -> str | None:
    selected = provider or configured_explainer()
    if selected is None:
        return None
    try:
        return selected.explain(score)
    except Exception:
        # Optional language output must never change or fail the saved statistic.
        return None
