"""Read published geography outlook tables and apply the modeller's display rules.

The files are produced by ``publish.py`` and mirrored from the model bucket
into ``MODEL_CACHE_DIR/kenya/<release>/``. This module only filters
them; no model is evaluated. The display rules come from the developer guides
of the LBW and under-five packages and are applied here, not in the UI.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from chart.climate.heat_seasons import heat_season
from chart.model_registry.runtime import model_cache_dir
from chart.model_registry.service import get_active_model_mapping
from chart.risk.precision import precision_for_ci
from chart.risk.schemas import MapResponse
from chart.risk.service import load_map_view
from chart.shared.db.models import AdminUnit, AppGeography, ModelRelease

from . import dlnm
from .schemas import (
    HeatOutlookResponse,
    MonthPart,
    OddsRatio,
    ObservedCapability,
    Option,
    OutlookCapabilities,
    OutlookMonth,
    OutlookPeriod,
    OfficialHeatSeason,
    PeakSeason,
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
# SSP3-7.0 is the project's planning scenario; partners advise against
# leading with SSP5-8.5.
DEFAULT_SCENARIO = "ssp370"
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


@dataclass(frozen=True)
class OutlookRestriction:
    """The options a country's model settings leave on (``chart.model_settings``).

    It only removes options: a code the file does not contain stays absent.
    """

    selectors: frozenset[str]
    scenarios: frozenset[str]
    default_selector: str | None = None
    default_scenario: str | None = None
    # The outlook views left on ("observed", "projection"); None leaves all on.
    data_modes: frozenset[str] | None = None

    def allows(self, view: str) -> bool:
        return self.data_modes is None or view in self.data_modes


@dataclass(frozen=True)
class PublishedOptions:
    """What the national file of one outcome offers, before any setting."""

    selectors: list[Option]
    scenarios: list[str]
    observed: bool


class ViewTurnedOff(LookupError):
    """The country's model settings switch this view (observed or projection) off."""


class OutlookNotAvailable(LookupError):
    """No published file covers this geography and outcome."""


class OutlookSelectionInvalid(ValueError):
    """A scenario, period or drop-down value the file does not contain."""


def outlook_release() -> str:
    return os.getenv("CHART_KENYA_OUTLOOK_RELEASE", DEFAULT_RELEASE)


def outlook_dir(release: str | None = None) -> Path:
    return model_cache_dir() / "kenya" / (release or outlook_release())


def county_slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower().replace("'", "")).strip("-")


def file_slug_for_geography(geography_id: str) -> str | None:
    """``geo-ke`` is the national file and ``geo-ke-<county>`` a county file."""

    if geography_id == "geo-ke":
        return "kenya"
    if geography_id.startswith("geo-ke-"):
        return geography_id.removeprefix("geo-ke-")
    return None


def published_index() -> dict[str, dict]:
    path = model_cache_dir() / "outlooks" / "index.json"
    return _read(path, path.stat().st_mtime_ns) if path.is_file() else {}


def _document(geography_id: str, outcome: str) -> tuple[dict, str] | None:
    # IDs are data, never paths supplied by the request.
    if not re.fullmatch(r"[A-Za-z0-9_-]+", geography_id) or outcome not in OUTCOMES:
        return None
    if outcome in published_index().get(geography_id, {}).get("outcomes", []):
        path = model_cache_dir() / "outlooks" / geography_id / f"{outcome}.json"
        if path.is_file():
            return _read(path, path.stat().st_mtime_ns), geography_id
        return None  # Never silently fall back to a superseded release.
    slug = file_slug_for_geography(geography_id)
    if slug is None:
        return None
    path = outlook_dir() / outcome / f"{slug}.json"
    return (_read(path, path.stat().st_mtime_ns), slug) if path.is_file() else None


def published_options(
    outcome: str, country_code: str = "KE"
) -> PublishedOptions | None:
    candidates = [
        (geo, item)
        for geo, item in published_index().items()
        if item["country_code"] == country_code and outcome in item.get("outcomes", [])
    ]
    candidates.sort(
        key=lambda pair: (
            pair[1].get("level") not in ("country", "state"),
            len(pair[0]),
        )
    )
    documents = []
    for geo, _ in candidates:
        found = _document(geo, outcome)
        if found is not None:
            documents = [found[0]]
            break
    if documents:
        observed_selectors = []
        if country_code == "KE" and outcome in OUTCOMES and _calibrated():
            try:
                observed_selectors = model_selector_options(outcome, outlook_release())
            except FileNotFoundError:
                # A partial model sync must not hide working projection tables.
                pass
        options = {
            option["code"]: _selector_option(option)
            for doc in documents
            for option in doc["selectors"]
        }
        # Projection handovers do not replace the calibrated observed scorer.
        # Country settings must retain selectors from both independent sources.
        options.update({option.code: option for option in observed_selectors})
        return PublishedOptions(
            selectors=list(options.values()),
            scenarios=sorted(
                {row["scenario"] for doc in documents for row in doc["periods"]}
            ),
            observed=bool(observed_selectors),
        )
    if country_code != "KE" or outcome not in OUTCOMES:
        return None
    found = _document("geo-ke", outcome)
    if found is None:
        try:
            selectors = model_selector_options(outcome, outlook_release())
        except FileNotFoundError:
            return None
        return PublishedOptions(
            selectors=selectors, scenarios=[], observed=_calibrated()
        )
    return PublishedOptions(
        selectors=[_selector_option(option) for option in found[0]["selectors"]],
        scenarios=sorted({row["scenario"] for row in found[0]["periods"]}),
        observed=_calibrated(),
    )


def _calibrated() -> bool:
    """Whether the release can score observed months (``observed.py``)."""

    return (dlnm.release_dir(outlook_release()) / "calibration.json").is_file()


def legacy_observed_supported(
    session: Session, geography_id: str, outcome: str
) -> bool:
    """Only the existing Kenya country/county calibration can supply this view.

    Neither a projection publication nor an ancestor's calibration extends
    observed coverage to a district or constituency.
    """

    if outcome not in OUTCOMES or not _calibrated():
        return False
    path = dlnm.release_dir(outlook_release()) / "calibration.json"
    try:
        counties = _read(path, path.stat().st_mtime_ns)["counties"]
        model_selector_options(outcome, outlook_release())
        # The observed ratio conversion also reads the LBW reference prevalence.
        dlnm.lbw_model(outlook_release())
    except FileNotFoundError:
        return False
    covered = {
        key
        for key, item in counties.items()
        if item.get("offset_c")
        and (outcome == LBW_OUTCOME or item.get("u5_reference_tmax_c") is not None)
    }
    if geography_id != "geo-ke" and geography_id not in covered:
        return False
    query = select(AdminUnit.id).where(
        AdminUnit.level == "county", AdminUnit.app_geography_id.in_(covered)
    )
    if geography_id != "geo-ke":
        query = query.where(AdminUnit.app_geography_id == geography_id)
    return session.scalar(query.limit(1)) is not None


def legacy_observed_geography(
    session: Session, geography_id: str, outcome: str
) -> bool:
    """The existing observed API accepts only Kenya and exact county records.

    A county without calibration or input months may return an empty observed
    response, as before; it must never borrow another place's estimate.
    """

    if outcome not in OUTCOMES:
        return False
    query = select(AdminUnit.id).where(
        AdminUnit.level == "county", AdminUnit.app_geography_id.like("geo-ke-%")
    )
    if geography_id != "geo-ke":
        query = query.where(AdminUnit.app_geography_id == geography_id)
    return session.scalar(query.limit(1)) is not None


def load_capabilities(
    session: Session,
    geography_id: str,
    outcome: str,
    *,
    restriction: OutlookRestriction,
    monthly_observed_enabled: bool,
) -> OutlookCapabilities:
    """Resolve observed and projection sources independently for this exact place."""

    found = _document(geography_id, outcome)
    geography = session.get(AppGeography, geography_id)
    observed = ObservedCapability(
        reason="No observed model is available for this place and outcome."
    )
    observed_enabled = False
    if legacy_observed_supported(session, geography_id, outcome):
        observed = ObservedCapability(source="outlook", release=outlook_release())
        observed_enabled = restriction.allows("observed")
    else:
        unit_id = session.scalar(
            select(AdminUnit.id).where(AdminUnit.app_geography_id == geography_id)
        )
        model = (
            get_active_model_mapping(session, admin_unit_id=unit_id, outcome=outcome)
            if unit_id is not None
            else None
        )
        release = session.get(ModelRelease, model.release_id) if model else None
        if model is not None and release is not None and release.status == "active":
            # Stored results, read in the same view as Kenya's observed months
            # (``observed_stored``): nothing is scored when a place opens.
            observed = ObservedCapability(
                source="outlook",
                release=model.release_id,
                model_area_name=model.model_area_name,
            )
            observed_enabled = monthly_observed_enabled
    if (
        found is None
        and observed.source is None
        and outcome in published_index().get(geography_id, {}).get("outcomes", [])
    ):
        # A missing projection file is a publication error, but must not take
        # an independently available observed model off the dashboard.
        raise OutlookNotAvailable(geography_id)
    if observed.source is not None and not observed_enabled:
        observed.reason = "Observed estimates are turned off in model settings."
        observed.batch_enabled = False
    modes = ["observed"] if observed_enabled else []
    if found is not None and restriction.allows("projection"):
        modes.append("projection")
    return OutlookCapabilities(
        published=found is not None,
        data_modes=modes,
        level=found[0]["level"] if found else geography.level if geography else None,
        projection_release=(
            found[0].get("release", outlook_release()) if found else None
        ),
        observed=observed,
    )


def model_selector_options(outcome: str, release: str) -> list[Option]:
    """The drop-down of the shipped models, labelled as in the model files."""

    if outcome == LBW_OUTCOME:
        meta = dlnm.lbw_model(release).meta
        return [
            Option(code=code, label=meta["window_labels"][code])
            for code in meta["windows"]
        ]
    return [
        Option(
            code=code,
            label=spec["label"],
            exploratory=str(spec.get("status", "")).startswith("exploratory"),
        )
        for code, spec in dlnm.u5_models(release).meta["models"].items()
    ]


def scenario_label(code: str) -> str:
    return SCENARIO_LABELS.get(code, code)


def _offered(
    document: dict, restriction: OutlookRestriction | None
) -> tuple[list[dict], list[str]]:
    """The file's selectors and scenarios that the settings leave on."""

    selectors = document["selectors"]
    scenarios = sorted({row["scenario"] for row in document["periods"]})
    if restriction is None:
        return selectors, scenarios
    return (
        [option for option in selectors if option["code"] in restriction.selectors],
        [code for code in scenarios if code in restriction.scenarios],
    )


def _resolve_selection(
    document: dict,
    outcome: str,
    scenario: str | None,
    period: str | None,
    selector: str | None,
    restriction: OutlookRestriction | None = None,
) -> tuple[str, str, str]:
    selectors, scenarios = _offered(document, restriction)
    defaults = restriction or OutlookRestriction(frozenset(), frozenset())
    scenario = scenario or defaults.default_scenario or DEFAULT_SCENARIO
    period = period or DEFAULT_PERIOD
    selector = (
        selector
        or defaults.default_selector
        or document.get("default_selector")
        or DEFAULT_SELECTOR[outcome]
    )
    # A disabled option is refused exactly like one the file does not have.
    if (
        scenario not in scenarios
        or period not in {row["period"] for row in document["periods"]}
        or selector not in {option["code"] for option in selectors}
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
    restriction: OutlookRestriction | None = None,
    reference: str = "annual",
) -> MapResponse:
    """The county map for one selection: each county's annual-average share,
    or with ``reference="peak"`` its peak-heat-season share.

    Shapes and framing come from the risk map, so this map draws exactly like
    the existing one; only the values are replaced with the published ones.
    """

    if restriction is not None and not restriction.allows("projection"):
        raise ViewTurnedOff("projection")
    national = _document(geography_id, outcome)
    if national is None:
        raise OutlookNotAvailable(geography_id)
    scenario, period, selector = _resolve_selection(
        national[0], outcome, scenario, period, selector, restriction
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
        if found is not None and reference == "peak":
            peak = _peak_season(found[0], outcome, scenario, period, selector)
            value = peak.part.value_percent if peak else None
            area.value_percent = value
            area.missing_reason = (
                "not_reported"
                if peak is None
                else None if value is not None else "no_excess"
            )
            continue
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
            legacy_rules="country_code" not in found[0],
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
    frame.metric = (
        "heat_attributable_share_peak_season"
        if reference == "peak"
        else "heat_attributable_share_annual_average"
    )
    return frame


def load_outlook(
    geography_id: str,
    outcome: str,
    *,
    scenario: str | None = None,
    period: str | None = None,
    selector: str | None = None,
    restriction: OutlookRestriction | None = None,
) -> HeatOutlookResponse:
    if restriction is not None and not restriction.allows("projection"):
        raise ViewTurnedOff("projection")
    found = _document(geography_id, outcome)
    if found is None:
        raise OutlookNotAvailable(geography_id)
    document, slug = found
    release = document.get("release", outlook_release())
    periods = sorted({row["period"] for row in document["periods"]})
    offered_selectors, scenarios = _offered(document, restriction)
    selectors = [_selector_option(option) for option in offered_selectors]
    scenario, period, selector = _resolve_selection(
        document, outcome, scenario, period, selector, restriction
    )

    baseline = document.get("baseline_period", periods[0])
    return HeatOutlookResponse(
        geography_id=geography_id,
        place=document["place"],
        level=document["level"],
        outcome=outcome,
        release=release,
        source_uri=document.get(
            "source_uri", f"{MODEL_BUCKET_URI}/kenya/{release}/{outcome}/{slug}.json"
        ),
        metadata_note=document.get("metadata_note"),
        baseline_period=_period_label(baseline),
        reference_note=_reference_note(document, baseline),
        scenarios=[Option(code=code, label=scenario_label(code)) for code in scenarios],
        periods=[Option(code=code, label=_period_label(code)) for code in periods],
        selectors=selectors,
        scenario=scenario,
        period=period,
        selector=selector,
        selector_note=(
            document.get("caveat") or _selector_note(outcome, selector, selectors)
        ),
        months=_months(document, outcome, scenario, period, selector),
        period_summary=_period_summary(document, outcome, scenario, selector, baseline),
        peak_season=_peak_season(document, outcome, scenario, period, selector),
        heat_season=_official_season(document.get("country_code", "KE")),
        data_modes=[
            v
            for v in document.get("data_modes", ["observed", "projection"])
            if v in enabled_views(restriction)
        ],
    )


def enabled_views(restriction: OutlookRestriction | None) -> list[str]:
    """The outlook views a reader may switch to, in display order."""

    return [
        view
        for view in ("observed", "projection")
        if restriction is None or restriction.allows(view)
    ]


@lru_cache(maxsize=16)
def _read(path: Path, _mtime_ns: int) -> dict:
    # The modification time is part of the key so a fresh sync is picked up
    # without a restart.
    return json.loads(path.read_text())


def _month_rows(document, scenario, period, selector):
    yield from (
        row
        for row in document["months"]
        if (row["scenario"], row["period"], row["selector"])
        == (scenario, period, selector)
    )
    for row in document.get("derived_months", []):
        if row[:3] == [scenario, period, selector]:
            yield dict(
                zip(
                    (
                        "scenario",
                        "period",
                        "selector",
                        "side",
                        "month",
                        "mean",
                        "min",
                        "max",
                        "change_mean",
                    ),
                    row,
                ),
                tmax_c=None,
            )


def _months(document, outcome, scenario, period, selector) -> list[OutlookMonth]:
    by_month: dict[int, OutlookMonth] = {}
    for row in _month_rows(document, scenario, period, selector):
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
                    legacy_rules="country_code" not in document,
                ),
            )
        )
        if row.get("odds_ratio"):
            month.odds_ratio = OddsRatio(**row["odds_ratio"])
    for month in by_month.values():
        month.parts.sort(key=lambda part: part.side != "heat")
    return [by_month[key] for key in sorted(by_month)]


MONTH_NAMES = (
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
)
PEAK_SEASON_MONTHS = 3


def _peak_season(document, outcome, scenario, period, selector) -> PeakSeason | None:
    """The three consecutive months with the highest heat share.

    Ranked by share, not temperature: an LBW month is the births of that
    month, exposed over the pregnancy before it, so the hottest calendar
    months are not the births heat affects most. For under-five (four-day
    lags) the two orders agree.
    """

    rows = {
        row["month"]: row
        for row in _month_rows(document, scenario, period, selector)
        if (row["scenario"], row["period"], row["selector"], row["side"])
        == (scenario, period, selector, "heat")
    }
    if len(rows) < 12 or any(row["mean"] is None for row in rows.values()):
        return None

    def block(start: int) -> list[int]:
        return [(start + offset - 1) % 12 + 1 for offset in range(PEAK_SEASON_MONTHS)]

    hottest = max(
        range(1, 13), key=lambda start: sum(rows[m]["mean"] for m in block(start))
    )
    chosen = block(hottest)

    def mean(key: str) -> float | None:
        values = [rows[month][key] for month in chosen]
        if any(value is None for value in values):
            return None
        return _percent(sum(values) / len(values))

    shown = _shown(
        outcome,
        selector,
        "heat",
        mean("mean"),
        None,
        None,
        legacy_rules="country_code" not in document,
    )
    visible = shown["value_percent"] is not None
    return PeakSeason(
        months=chosen,
        label=f"{MONTH_NAMES[chosen[0] - 1]}–{MONTH_NAMES[chosen[-1] - 1]}",
        part=MonthPart(side="heat", **shown),
        gcm_min_percent=(
            mean("min") if visible and "country_code" not in document else None
        ),
        gcm_max_percent=(
            mean("max") if visible and "country_code" not in document else None
        ),
    )


def _official_season(country_code: str) -> OfficialHeatSeason | None:
    season = heat_season(country_code)
    if season is None:
        return None
    return OfficialHeatSeason(
        label=season.label,
        months=list(season.months),
        peak_month=season.peak_month,
        source_name=season.source_name,
        source_uri=season.source_uri,
    )


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
            legacy_rules="country_code" not in document,
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
    *,
    legacy_rules: bool = True,
) -> dict:
    """The value and range to display, or the guide's message in their place.

    A negative attributable share means the risk ratio is below 1. The guides
    ask for it to be suppressed, never shown as heat "preventing" cases, so a
    suppressed value carries no range either.
    """

    hidden = {"value_percent": None, "low_percent": None, "high_percent": None}
    shown = {"value_percent": value, "low_percent": low, "high_percent": high}
    negative = value is not None and value < 0
    if outcome == LBW_OUTCOME and ((legacy_rules and selector == "T3") or negative):
        return {**hidden, "message": NO_EXCESS_LBW}
    if (
        legacy_rules
        and outcome == U5_OUTCOME
        and selector == "neonatal"
        and side == "heat"
    ):
        # The guide's finding is that newborn deaths carry no heat excess; a
        # share beside that note would contradict it, so none is shown.
        return {**hidden, "message": NO_EXCESS_NEONATAL}
    if negative:
        message = (
            NO_EXCESS_HEAT
            if side == "heat"
            else (
                NO_EXCESS_COOL
                if side == "cool"
                else "No excess attributable to temperature estimated (risk ratio below 1)."
            )
        )
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
            f"the model minimum-risk temperature "
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
