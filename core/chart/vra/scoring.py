"""The VRA scoring method ("vra-v1") as plain functions over numbers.

No FastAPI, Dagster or database imports: the service gathers the latest value
per indicator and area, calls :func:`score`, and stores what comes back.

Recipe (docs/vra-integration-plan.md section 2):

1. For each indicator with at least ``MIN_AREAS`` areas present, take the 5th
   and 95th percentiles across the areas (linear interpolation), clip, and
   scale to 0-1; flip when more of it means less risk. No spread excludes it.
2. A component is the equal-weight mean of the indicator scores an area has,
   provided it has at least two thirds of the component's scoreable indicators
   (and at least one); otherwise it is missing, never zero.
3. Every normalised score points towards risk, so the adaptive-capacity mean
   is the lack of capacity (LAC); the component is reported as capacity,
   AC = 1 - LAC. Vulnerability is the mean of sensitivity and LAC, over
   whichever of the two exist.
4. Risk is the geometric mean of hazard, exposure and vulnerability, each
   floored at 0.01 so one zero does not erase the others; missing if any of
   the three is missing.
5. Classes are the quartiles of the scored areas' risk; rank 1 is the highest.
   Drivers are up to three indicators scoring at least 0.8, largest
   contribution first.
"""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass, field

METHOD_VERSION = "vra-v1"
COMPONENTS = ("hazard", "exposure", "sensitivity", "adaptive_capacity")
CLASSES = ("low", "moderate", "high", "very_high")
LOWER_PERCENTILE = 5.0
UPPER_PERCENTILE = 95.0
MIN_AREAS = 3
COVERAGE_THRESHOLD = 2 / 3
RISK_FLOOR = 0.01
DRIVER_THRESHOLD = 0.8
MAX_DRIVERS = 3

PARAMS = {
    "weights": "equal",
    "lower_percentile": LOWER_PERCENTILE,
    "upper_percentile": UPPER_PERCENTILE,
    "percentile_method": "linear",
    "min_areas": MIN_AREAS,
    "coverage_threshold": COVERAGE_THRESHOLD,
    "risk_floor": RISK_FLOOR,
    "driver_threshold": DRIVER_THRESHOLD,
    "classing": "quartiles",
}


@dataclass(frozen=True)
class Indicator:
    code: str
    component: str
    direction_to_risk: int


@dataclass
class IndicatorScore:
    raw: float | None = None
    normalised: float | None = None
    weight: float | None = None
    contribution: float | None = None
    excluded_reason: str | None = None


@dataclass
class AreaScore:
    components: dict[str, float | None]
    vulnerability: float | None
    risk: float | None
    coverage: dict[str, float]
    indicators: dict[str, IndicatorScore]
    drivers: list[str] = field(default_factory=list)
    risk_class: str | None = None
    rank: int | None = None
    missing_reason: str | None = None


@dataclass
class Assessment:
    bounds: dict[str, dict]
    class_breaks: list[float]
    areas: dict[int, AreaScore]
    scored_indicators: list[str]


def percentile(values: list[float], p: float) -> float:
    """Linear-interpolation percentile (numpy's default, Hyndman-Fan type 7)."""

    ordered = sorted(values)
    position = (len(ordered) - 1) * p / 100
    low = math.floor(position)
    high = min(low + 1, len(ordered) - 1)
    return ordered[low] + (ordered[high] - ordered[low]) * (position - low)


def _bounds(values: list[float]) -> dict:
    if not values:
        return {"lo": None, "hi": None, "n": 0, "excluded_reason": "no_data"}
    if len(values) < MIN_AREAS:
        return {
            "lo": None,
            "hi": None,
            "n": len(values),
            "excluded_reason": "too_few_areas",
        }
    lo = percentile(values, LOWER_PERCENTILE)
    hi = percentile(values, UPPER_PERCENTILE)
    reason = "no_spread" if hi == lo else None
    return {"lo": lo, "hi": hi, "n": len(values), "excluded_reason": reason}


def normalise(value: float, lo: float, hi: float, direction: int) -> float:
    scaled = (min(max(value, lo), hi) - lo) / (hi - lo)
    return 1 - scaled if direction < 0 else scaled


def _mean(values: list[float]) -> float | None:
    return sum(values) / len(values) if values else None


def score(
    indicators: list[Indicator],
    areas: list[int],
    values: dict[str, dict[int, float]],
) -> Assessment:
    """Score ``areas`` on ``indicators`` given ``values[code][area]``."""

    bounds = {
        ind.code: _bounds(
            [v for a, v in values.get(ind.code, {}).items() if a in areas]
        )
        for ind in indicators
    }
    scoreable = [
        ind for ind in indicators if bounds[ind.code]["excluded_reason"] is None
    ]
    per_component = {
        c: [ind for ind in scoreable if ind.component == c] for c in COMPONENTS
    }

    results: dict[int, AreaScore] = {}
    for area in areas:
        detail: dict[str, IndicatorScore] = {}
        for ind in indicators:
            raw = values.get(ind.code, {}).get(area)
            reason = bounds[ind.code]["excluded_reason"] or (
                "missing" if raw is None else None
            )
            detail[ind.code] = IndicatorScore(raw=raw, excluded_reason=reason)
            if reason is None and raw is not None:
                b = bounds[ind.code]
                detail[ind.code].normalised = normalise(
                    raw, b["lo"], b["hi"], ind.direction_to_risk
                )

        components: dict[str, float | None] = {}
        coverage: dict[str, float] = {}
        for component, members in per_component.items():
            present = [
                ind for ind in members if detail[ind.code].normalised is not None
            ]
            share = len(present) / len(members) if members else 0.0
            coverage[component] = share
            if not present or share < COVERAGE_THRESHOLD:
                components[component] = None
                continue
            weight = 1 / len(present)
            for ind in present:
                item = detail[ind.code]
                item.weight = weight
                item.contribution = weight * (item.normalised or 0.0)
            components[component] = sum(
                detail[ind.code].contribution or 0.0 for ind in present
            )
        # Normalised scores all point towards risk, so the adaptive-capacity
        # mean above is the *lack* of capacity. Report capacity itself (higher
        # is better) so that LAC = 1 - AC is the risk-facing term.
        lack = components["adaptive_capacity"]
        components["adaptive_capacity"] = None if lack is None else 1 - lack
        vulnerability = _mean(
            [v for v in (components["sensitivity"], lack) if v is not None]
        )
        hazard, exposure = components["hazard"], components["exposure"]
        risk = (
            None
            if hazard is None or exposure is None or vulnerability is None
            else (
                max(hazard, RISK_FLOOR)
                * max(exposure, RISK_FLOOR)
                * max(vulnerability, RISK_FLOOR)
            )
            ** (1 / 3)
        )
        drivers = sorted(
            (
                code
                for code, item in detail.items()
                if item.contribution is not None
                and (item.normalised or 0.0) >= DRIVER_THRESHOLD
            ),
            key=lambda code: (-(detail[code].contribution or 0.0), code),
        )[:MAX_DRIVERS]
        results[area] = AreaScore(
            components=components,
            vulnerability=vulnerability,
            risk=risk,
            coverage=coverage,
            indicators=detail,
            drivers=drivers,
            missing_reason=None if risk is not None else "insufficient_data",
        )

    scored = [a for a in areas if results[a].risk is not None]
    risks = [results[a].risk or 0.0 for a in scored]
    breaks = [percentile(risks, p) for p in (25, 50, 75)] if risks else []
    for position, area in enumerate(
        sorted(scored, key=lambda a: (-(results[a].risk or 0.0), a)), start=1
    ):
        result = results[area]
        result.rank = position
        result.risk_class = CLASSES[sum((result.risk or 0.0) > b for b in breaks)]

    return Assessment(
        bounds=bounds,
        class_breaks=breaks,
        areas=results,
        scored_indicators=[ind.code for ind in scoreable],
    )


def digest(payload: object) -> str:
    """Stable SHA-256 of JSON-able data; floats rounded so reruns compare equal."""

    def clean(value: object) -> object:
        if isinstance(value, float):
            return round(value, 12)
        if isinstance(value, dict):
            return {str(k): clean(v) for k, v in value.items()}
        if isinstance(value, (list, tuple)):
            return [clean(v) for v in value]
        return value

    text = json.dumps(clean(payload), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(text.encode("utf-8")).hexdigest()
