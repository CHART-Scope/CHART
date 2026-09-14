"""Pure math: odds ratio -> relative risk -> attributable fraction -> count.

The published fitted ERF spline lives in ``erf_parameters.spline_coefficients``
and is what a fully-integrated pipeline will evaluate against a temperature
exposure. Until the modeler publishes real spline coefficients, this
module implements the standard textbook approximation from the odds
ratio returned by the R inference service:

    AF = max(0, (OR - 1) / OR)
    RR ~= OR   (rare-outcome assumption; documented in-line)

That approximation is *not* the final science. LBW is only moderately
rare (~10-20% baseline), so OR modestly overstates RR; the shape of a
real ERF spline over a lag window is not captured at all. Every call
site that consumes these numbers should note the approximation, and the
call site *must* be replaced once ``spline_coefficients`` carry the real
coefficients.

All wire values are integer milli-units (``x_milli`` = round(x * 1000))
so the API surface is round-trip stable across languages and databases.
"""

from __future__ import annotations

MAX_MILLI = 100_000


def _clamp_milli(value: float) -> int:
    if value < 0:
        return 0
    if value > MAX_MILLI:
        return MAX_MILLI
    return round(value)


def relative_risk_milli(odds_ratio: float) -> int:
    """Return RR ~= OR as milli-integer, clamped to [0, 100000].

    The rare-outcome approximation. See the module docstring for the
    caveat: LBW's baseline prevalence means OR modestly overstates RR.
    """

    if odds_ratio <= 0:
        return 0
    return _clamp_milli(odds_ratio * 1000)


def attributable_fraction_milli(odds_ratio: float) -> int:
    """Return AF = max(0, (OR - 1) / OR) as milli-integer.

    Zero when OR <= 1 (no attributable share when exposure is neutral
    or protective). The formula assumes rare outcomes; see the module
    docstring.
    """

    if odds_ratio <= 1:
        return 0
    fraction = (odds_ratio - 1) / odds_ratio
    return _clamp_milli(fraction * 1000)


def attributable_number(
    attributable_fraction_milli: int, population: int | None
) -> int | None:
    """Convert AF (milli) x population into a rounded case count.

    Returns ``None`` when the caller could not resolve a population
    figure; the ``health_impact`` schema permits a null count for that
    reason. Negative populations are rejected so a bad covariate row
    cannot silently zero the number out.
    """

    if population is None:
        return None
    if population < 0:
        raise ValueError("attributable_number requires a non-negative population")
    if attributable_fraction_milli <= 0:
        return 0
    return round(attributable_fraction_milli * population / 1000)
