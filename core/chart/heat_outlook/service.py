"""Read the published Kenya tables and apply the modeller's display rules.

The files are produced by ``publish.py`` and mirrored from the model bucket
into ``MODEL_CACHE_DIR/kenya/outlook/<release>/``. This module only filters
them; no model is evaluated. The display rules come from the developer guides
of the LBW and under-five packages and are applied here, not in the UI.
"""

from __future__ import annotations

import json
import os
import re
from functools import lru_cache
from pathlib import Path

from sqlalchemy.orm import Session

from chart.model_registry.runtime import model_cache_dir
from chart.risk.precision import precision_for_ci
from chart.risk.schemas import MapResponse
from chart.risk.service import load_map_view

from .schemas import (
    HeatOutlookResponse,
    MonthPart,
    OddsRatio,
    Option,
    OutlookMonth,
    OutlookPeriod,
    PeriodPart,
    Ratio,
)

LBW_OUTCOME = "lbw"
U5_OUTCOME = "under_5_mortality"
OUTCOMES = (LBW_OUTCOME, U5_OUTCOME)
DEFAULT_RELEASE = "v2_2026_10_06"
MODEL_BUCKET_URI = "s3://chart-predictive-models"

SCENARIO_LABELS = {
    "ssp126": "SSP1-2.6 (low emissions)",
    "ssp370": "SSP3-7.0 (medium-high emissions)",
    "ssp585": "SSP5-8.5 (high emissions)",
}
DEFAULT_SCENARIO = "ssp585"
DEFAULT_PERIOD = "2041-2060"
# Whole pregnancy for LBW and post-neonatal for under-five, as agreed with the
# modeller (call of 2026-10-08): whole pregnancy has the clearest heat curve,
# and the neonatal model shows no heat excess at all.
DEFAULT_SELECTOR = {LBW_OUTCOME: "P", U5_OUTCOME: "postneonatal"}
# Above this share of months (or days) beyond the 99th percentile of the
# fitting data, the guide asks for a thin-data flag.
THIN_DATA_SHARE_PERCENT = 10.0

NO_EXCESS_LBW = (
    "No excess heat risk estimated for this window "
    "(estimate below 1, compatible with no effect)."
)
NO_EXCESS_NEONATAL = (
    "No heat-related excess in newborn deaths was found; "
    "risk was higher on cooler days."
)
NO_EXCESS_HEAT = "No heat-related excess estimated (risk ratio below 1)."
NO_EXCESS_COOL = "No excess on cooler-than-usual days (risk ratio below 1)."
EXPLORATORY = "Approximate death dates."
T3_NOTE = (
    f"{NO_EXCESS_LBW} Monthly odds ratios, read from the national curve at the "
    "hottest month of the trimester, are in the seasonal pattern."
)
THIN_DATA = "Estimate relies partly on temperatures rarely seen in the fitting data."


class OutlookNotAvailable(LookupError):
    """No published file covers this geography and outcome."""


class OutlookSelectionInvalid(ValueError):
    """A scenario, period or drop-down value the file does not contain."""


def outlook_release() -> str:
    return os.getenv("CHART_KENYA_OUTLOOK_RELEASE", DEFAULT_RELEASE)


def outlook_dir(release: str | None = None) -> Path:
    return model_cache_dir() / "kenya" / "outlook" / (release or outlook_release())


def county_slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower().replace("'", "")).strip("-")


def file_slug_for_geography(geography_id: str) -> str | None:
    """``geo-ke`` is the national file and ``geo-ke-<county>`` a county file."""

    if geography_id == "geo-ke":
        return "kenya"
    if geography_id.startswith("geo-ke-"):
        return geography_id.removeprefix("geo-ke-")
    return None


def _document(geography_id: str, outcome: str) -> tuple[dict, str] | None:
    """The published file for a place and outcome, and its file slug."""

    slug = file_slug_for_geography(geography_id)
    if slug is None or outcome not in OUTCOMES:
        return None
    path = outlook_dir() / outcome / f"{slug}.json"
    if not path.is_file():
        return None
    return _read(path, path.stat().st_mtime_ns), slug


def _resolve_selection(
    document: dict,
    outcome: str,
    scenario: str | None,
    period: str | None,
    selector: str | None,
) -> tuple[str, str, str]:
    scenario = scenario or DEFAULT_SCENARIO
    period = period or DEFAULT_PERIOD
    selector = selector or DEFAULT_SELECTOR[outcome]
    if (
        scenario not in {row["scenario"] for row in document["periods"]}
        or period not in {row["period"] for row in document["periods"]}
        or selector not in {option["code"] for option in document["selectors"]}
    ):
        raise OutlookSelectionInvalid(f"{scenario}/{period}/{selector}")
    return scenario, period, selector


def load_outlook_map(
    session: Session,
    geography_id: str,
    outcome: str,
    *,
    scenario: str | None = None,
    period: str | None = None,
    selector: str | None = None,
) -> MapResponse:
    """The county map for one selection: each county's annual-average share.

    Shapes and framing come from the risk map, so this map draws exactly like
    the existing one; only the values are replaced with the published ones.
    """

    national = _document("geo-ke", outcome)
    if national is None:
        raise OutlookNotAvailable(geography_id)
    scenario, period, selector = _resolve_selection(
        national[0], outcome, scenario, period, selector
    )
    frame = load_map_view(
        session, geography_id, None, outcome=outcome, with_values=False
    )
    for area in frame.areas:
        found = _document(area.geography_id or "", outcome)
        row = None
        if found is not None:
            row = next(
                (
                    item
                    for item in found[0]["periods"]
                    if (
                        item["scenario"],
                        item["period"],
                        item["selector"],
                        item["side"],
                    )
                    == (scenario, period, selector, "heat")
                ),
                None,
            )
        area.value_percent = None
        area.odds_ratio = None
        area.on_training_support = None
        if found is None or row is None:
            # T3 has no period summary; an unpublished county (Narok) has no file.
            area.missing_reason = "no_model" if found is None else "not_reported"
            continue
        shown = _shown(
            outcome,
            selector,
            "heat",
            row["value_pct"],
            row["low_pct"],
            row["high_pct"],
        )
        area.value_percent = shown["value_percent"]
        area.missing_reason = (
            None if shown["value_percent"] is not None else "no_excess"
        )
        ratio = _ratio(found[0], row)
        area.odds_ratio = ratio.value if ratio else None
        area.on_training_support = (
            row["share_above_p99_pct"] or 0
        ) <= THIN_DATA_SHARE_PERCENT
    frame.metric = "heat_attributable_share_annual_average"
    return frame


def load_outlook(
    geography_id: str,
    outcome: str,
    *,
    scenario: str | None = None,
    period: str | None = None,
    selector: str | None = None,
) -> HeatOutlookResponse:
    found = _document(geography_id, outcome)
    if found is None:
        raise OutlookNotAvailable(geography_id)
    document, slug = found
    release = outlook_release()
    periods = sorted({row["period"] for row in document["periods"]})
    scenarios = sorted({row["scenario"] for row in document["periods"]})
    selectors = [_selector_option(option) for option in document["selectors"]]
    scenario, period, selector = _resolve_selection(
        document, outcome, scenario, period, selector
    )

    baseline = periods[0]
    return HeatOutlookResponse(
        geography_id=geography_id,
        place=document["place"],
        level=document["level"],
        outcome=outcome,
        release=release,
        source_uri=f"{MODEL_BUCKET_URI}/kenya/outlook/{release}/{outcome}/{slug}.json",
        baseline_period=_period_label(baseline),
        reference_note=_reference_note(document, baseline),
        scenarios=[
            Option(code=code, label=SCENARIO_LABELS.get(code, code))
            for code in scenarios
        ],
        periods=[Option(code=code, label=_period_label(code)) for code in periods],
        selectors=selectors,
        scenario=scenario,
        period=period,
        selector=selector,
        selector_note=_selector_note(outcome, selector, selectors),
        months=_months(document, outcome, scenario, period, selector),
        period_summary=_period_summary(document, outcome, scenario, selector, baseline),
    )


@lru_cache(maxsize=256)
def _read(path: Path, _mtime_ns: int) -> dict:
    # The modification time is part of the key so a fresh sync is picked up
    # without a restart.
    return json.loads(path.read_text())


def _months(document, outcome, scenario, period, selector) -> list[OutlookMonth]:
    by_month: dict[int, OutlookMonth] = {}
    for row in document["months"]:
        if (row["scenario"], row["period"], row["selector"]) != (
            scenario,
            period,
            selector,
        ):
            continue
        month = by_month.setdefault(
            row["month"],
            OutlookMonth(month=row["month"], tmax_c=row["tmax_c"], parts=[]),
        )
        month.parts.append(
            MonthPart(
                side=row["side"],
                **_shown(
                    outcome,
                    selector,
                    row["side"],
                    _percent(row["mean"]),
                    _percent(row["min"]),
                    _percent(row["max"]),
                ),
            )
        )
        if row.get("odds_ratio"):
            month.odds_ratio = OddsRatio(**row["odds_ratio"])
    for month in by_month.values():
        month.parts.sort(key=lambda part: part.side != "heat")
    return [by_month[key] for key in sorted(by_month)]


def _period_summary(
    document, outcome, scenario, selector, baseline
) -> list[OutlookPeriod]:
    by_period: dict[str, OutlookPeriod] = {}
    for row in document["periods"]:
        if (row["scenario"], row["selector"]) != (scenario, selector):
            continue
        summary = by_period.setdefault(
            row["period"],
            OutlookPeriod(
                period=row["period"],
                label=_period_label(row["period"]),
                is_baseline=row["period"] == baseline,
                parts=[],
            ),
        )
        thin = (row["share_above_p99_pct"] or 0) > THIN_DATA_SHARE_PERCENT
        shown = _shown(
            outcome,
            selector,
            row["side"],
            row["value_pct"],
            row["low_pct"],
            row["high_pct"],
        )
        if thin and shown["message"] is None:
            shown["message"] = THIN_DATA
        summary.parts.append(
            PeriodPart(
                side=row["side"],
                gcm_min_percent=row["gcm_min_pct"],
                gcm_max_percent=row["gcm_max_pct"],
                change_pp=None if summary.is_baseline else row["change_pp"],
                change_low_pp=None if summary.is_baseline else row["change_low_pp"],
                change_high_pp=None if summary.is_baseline else row["change_high_pp"],
                share_above_p99_percent=row["share_above_p99_pct"],
                thin_data=thin,
                ratio=_ratio(document, row),
                **shown,
            )
        )
    for summary in by_period.values():
        summary.parts.sort(key=lambda part: part.side != "heat")
    return [by_period[key] for key in sorted(by_period)]


def _ratio(document: dict, row: dict) -> Ratio | None:
    """The odds ratio (LBW) or risk ratio (under-five) behind a period share.

    Inverts the modeller's own conversions: AF = 1 - 1/RR for both outcomes,
    and for LBW RR = OR / ((1 - p0) + p0 * OR) (Zhang-Yu), so
    OR = RR (1 - p0) / (1 - p0 RR). Applied to the point and both CI bounds.
    """

    shares = (row["value_pct"], row["low_pct"], row["high_pct"])
    if any(share is None or share >= 100 for share in shares):
        return None
    lbw = document["outcome"] == LBW_OUTCOME
    p0 = document.get("p0", 0.0)

    def convert(share: float) -> float | None:
        rr = 1 / (1 - share / 100)
        if not lbw:
            return rr
        # Zhang-Yu has no inverse once p0 * RR reaches 1 (a share above
        # roughly 93% at p0 = 6.6%); report no ratio rather than a wrong one.
        return rr * (1 - p0) / (1 - p0 * rr) if p0 * rr < 1 else None

    value, low, high = (convert(share) for share in shares)
    if value is None or low is None or high is None:
        return None
    return Ratio(
        kind="odds_ratio" if lbw else "risk_ratio",
        value=round(value, 4),
        low=round(low, 4),
        high=round(high, 4),
        precision=precision_for_ci(low, high),
    )


def _shown(
    outcome: str,
    selector: str,
    side: str,
    value: float | None,
    low: float | None,
    high: float | None,
) -> dict:
    """The value and range to display, or the guide's message in their place.

    A negative attributable share means the risk ratio is below 1. The guides
    ask for it to be suppressed, never shown as heat "preventing" cases, so a
    suppressed value carries no range either.
    """

    hidden = {"value_percent": None, "low_percent": None, "high_percent": None}
    shown = {"value_percent": value, "low_percent": low, "high_percent": high}
    negative = value is not None and value < 0
    if outcome == LBW_OUTCOME and (selector == "T3" or negative):
        return {**hidden, "message": NO_EXCESS_LBW}
    if outcome == U5_OUTCOME and selector == "neonatal" and side == "heat":
        # The guide's finding is that newborn deaths carry no heat excess; a
        # share beside that note would contradict it, so none is shown.
        return {**hidden, "message": NO_EXCESS_NEONATAL}
    if negative:
        message = NO_EXCESS_HEAT if side == "heat" else NO_EXCESS_COOL
        return {**hidden, "message": message}
    return {**shown, "message": None}


def _selector_option(option: dict) -> Option:
    status = option.get("status", "")
    return Option(
        code=option["code"],
        label=option["label"],
        exploratory=status.startswith("exploratory"),
    )


def _selector_note(outcome: str, selector: str, selectors: list[Option]) -> str | None:
    if outcome == LBW_OUTCOME and selector == "T3":
        return T3_NOTE
    chosen = next(option for option in selectors if option.code == selector)
    return EXPLORATORY if chosen.exploratory else None


def _reference_note(document: dict, baseline: str) -> str:
    if document["outcome"] == LBW_OUTCOME:
        return (
            "Heat-attributable share of low birth weight: only months warmer than "
            f"the national minimum-risk temperature "
            f"({document['reference_temperature_c']:.1f} °C) count. "
            f"Baseline {_period_label(baseline)}."
        )
    return (
        "Share of under-five deaths attributable to temperature, relative to each "
        f"area's own {_period_label(baseline)} mean daily maximum temperature. "
        "A cool share means cooler than usual, not cold."
    )


def _period_label(period: str) -> str:
    return period.replace("-", "–")


def _percent(fraction: float | None) -> float | None:
    return None if fraction is None else round(fraction * 100, 2)
