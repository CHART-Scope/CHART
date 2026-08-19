"""Precision classification for confidence intervals.

The dashboard's precision badge summarises how tight a 95% CI is around
a relative-risk / odds-ratio estimate. Rather than reasoning about the
raw CI width (which is scale-dependent), we use the CI ratio
``high / low`` — this is scale-invariant so the same thresholds work
whether the caller passes raw floats (RR = 1.15) or milli-scaled ints
(1150).

Thresholds agreed with the health team (see Alessandro / Lucia,
2026-08):

* HIGH precision — CI ratio ≤ 2.5 (no indication of substantial imprecision)
* MODERATE precision — 2.5 < CI ratio ≤ 5 (potential imprecision)
* LOW precision — CI ratio > 5 (imprecise / wide confidence interval)

Keep these in sync with ``web/src/lib/precision.ts``.
"""

from __future__ import annotations

from typing import Literal


PrecisionLevel = Literal["high", "moderate", "low"]

HIGH_CI_RATIO_MAX = 2.5
MODERATE_CI_RATIO_MAX = 5.0


def ci_ratio(low: float, high: float) -> float:
    """Return the confidence-interval ratio (``high / low``).

    Defaults to ``float('inf')`` when ``low`` is non-positive, which
    forces the caller into the LOW precision bucket rather than blowing
    up on a divide-by-zero.
    """

    if low <= 0:
        return float("inf")
    return max(high, low) / low


def precision_for_ci(low: float, high: float) -> PrecisionLevel:
    """Classify a 95% CI into a precision level.

    Works for both raw estimates (``low=1.03, high=1.29``) and milli
    encodings (``low=1030, high=1290``) because the classification
    depends only on the ratio.
    """

    ratio = ci_ratio(low, high)
    if ratio <= HIGH_CI_RATIO_MAX:
        return "high"
    if ratio <= MODERATE_CI_RATIO_MAX:
        return "moderate"
    return "low"
