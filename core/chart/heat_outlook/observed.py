"""Kenya's heat-attributable share for an observed month, from ERA5.

The published tables (``service.py``) answer "what does a typical month of a
future period look like". This module answers "what did this month look
like": it reads the ERA5 temperatures CHART already ingests for every county,
moves them onto the scale the models were fitted on, and scores them with
the modeller's DLNM (``dlnm.py``).

Scale. The models were fitted on a 0.1 deg C daily Tmax product (the
hand-over's ``Kenya_Combined_rasters``), not on ERA5. Over 2011-2020 ERA5 runs
warmer than it, by about 1 deg C on average and by 2.6 deg C in Baringo (up to
4 deg C in some months), so scoring raw ERA5 would overstate heat risk. Each ERA5 value is
therefore shifted by a fixed offset per county and calendar month: the
model-scale 2011-2020 mean Tmax for that month (the modeller's typical-month
table, mean of its three scenarios) minus ERA5's own 2011-2020 mean. Only
ERA5's departure from its own climate is used, which is what an anomaly
method keeps. ``publish.py --era5-climatology`` writes the offsets.

Low birth weight: births in month M are scored on the calibrated monthly
mean Tmax of M and the eight months before it (lag 0 is the birth month).
Under-five: every day of M is scored on that day and the three before it,
relative to the county's 1991-2020 mean daily Tmax, and the month is the
mean of the daily attributable shares - the same ``trailing_window_mean``
reduction the India under-five path uses.
"""

from __future__ import annotations

import json
from calendar import monthrange
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, timedelta
from functools import lru_cache

from sqlalchemy import select
from sqlalchemy.orm import Session

from chart.risk.schemas import MapResponse
from chart.risk.service import load_map_view
from chart.shared.db.models import (
    AdminUnit,
    ClimateRun,
    DataLabel,
    DistrictClimate,
    DistrictClimateDay,
)

from . import dlnm
from .schemas import ObservedEstimate, ObservedInput, ObservedMonth, ObservedResponse
from .service import (
    DEFAULT_SELECTOR,
    LBW_OUTCOME,
    OUTCOMES,
    THIN_DATA,
    THIN_DATA_SHARE_PERCENT,
    Option,
    OutlookNotAvailable,
    OutlookRestriction,
    OutlookSelectionInvalid,
    _ratio,
    _selector_note,
    ViewTurnedOff,
    _shown,
    enabled_views,
    model_selector_options,
    outlook_release,
)

MONTHLY_VARIABLE = "tmax_monthly_mean_c"
DAILY_VARIABLE = "tmax_c"
OBSERVED_LABELS = (DataLabel.observed, DataLabel.reanalysis)
LBW_LAGS = 9
U5_LAGS = 4
KENYA = "geo-ke"
#: Share of counties (percent) that must score a month for Kenya to show it.
NATIONAL_COVERAGE = 50


class ObservedNotCalibrated(LookupError):
    """The release has no ERA5 offsets, so no observed month can be scored."""


@dataclass(frozen=True)
class Calibration:
    offsets: dict[str, list[float]]
    u5_reference: dict[str, float]
    note: str


@dataclass(frozen=True)
class CountyMonth:
    value_percent: float
    low_percent: float
    high_percent: float
    thin_data: bool
    inputs: list[ObservedInput]


@lru_cache(maxsize=4)
def calibration(release: str) -> Calibration:
    path = dlnm.release_dir(release) / "calibration.json"
    if not path.is_file():
        raise ObservedNotCalibrated(release)
    document = json.loads(path.read_text())
    return Calibration(
        offsets={key: value["offset_c"] for key, value in document["counties"].items()},
        u5_reference={
            key: value["u5_reference_tmax_c"]
            for key, value in document["counties"].items()
        },
        note=document["note"],
    )


def load_observed(
    session: Session,
    geography_id: str,
    outcome: str,
    *,
    month: str | None = None,
    selector: str | None = None,
    restriction: OutlookRestriction | None = None,
) -> ObservedResponse:
    if restriction is not None and not restriction.allows("observed"):
        raise ViewTurnedOff("observed")
    release = outlook_release()
    units = _units(session, geography_id, outcome)
    selectors, selector = _resolve_selector(outcome, release, selector, restriction)
    scored = _score_units(session, units, outcome, selector, release)
    available = _available(scored)
    if month is not None and month not in available:
        raise OutlookSelectionInvalid(month)
    chosen = month or _default_month(
        session, geography_id, outcome, selector, release, available
    )

    estimate = None
    inputs: list[ObservedInput] = []
    if chosen is not None:
        values = [
            by_month[chosen] for by_month in scored.values() if chosen in by_month
        ]
        estimate = _estimate(outcome, selector, values, release)
        if len(units) == 1:
            inputs = values[0].inputs

    history = [
        ObservedMonth(
            month=key,
            value_percent=_estimate(
                outcome,
                selector,
                [by_month[key] for by_month in scored.values() if key in by_month],
                release,
            ).value_percent,
        )
        for key in available
    ]
    place = "Kenya" if geography_id == KENYA else units[0].name
    return ObservedResponse(
        geography_id=geography_id,
        place=place if geography_id == KENYA else f"{place} County",
        level="country" if geography_id == KENYA else "county",
        outcome=outcome,
        release=release,
        selectors=selectors,
        selector=selector,
        selector_note=_selector_note(outcome, selector, selectors),
        month=chosen,
        available_months=available,
        estimate=estimate,
        inputs=inputs,
        history=history,
        reference_note=_reference_note(outcome, release),
        calibration_note=calibration(release).note,
        data_modes=enabled_views(restriction),
    )


def load_observed_map(
    session: Session,
    geography_id: str,
    outcome: str,
    *,
    month: str | None = None,
    selector: str | None = None,
    restriction: OutlookRestriction | None = None,
) -> MapResponse:
    """Frame the selected place; shade only exactly calibrated county areas."""

    if restriction is not None and not restriction.allows("observed"):
        raise ViewTurnedOff("observed")
    release = outlook_release()
    _, selector = _resolve_selector(outcome, release, selector, restriction)
    units = _units(session, KENYA, outcome)
    scored = _score_units(session, units, outcome, selector, release)
    # Any month one county can score may be mapped: a county's newest month
    # is often newer than Kenya's, and the map shows the others as missing.
    any_county = sorted({key for by_month in scored.values() for key in by_month})
    national = _available(scored)
    chosen = month or (national[-1] if national else None)
    if month is not None and month not in any_county:
        raise OutlookSelectionInvalid(month)

    # Drill-down uses the same hierarchy as projections. Constituencies keep
    # their own outlines and missing values; a county's calibrated estimate
    # belongs only to that county, never to each of its children.
    frame = load_map_view(
        session, geography_id, chosen, outcome=outcome, with_values=False
    )
    by_geography = {unit.app_geography_id: scored[unit.id] for unit in units}
    for area in frame.areas:
        value = by_geography.get(area.geography_id or "", {}).get(chosen or "")
        area.odds_ratio = None
        area.value_percent = None
        area.on_training_support = None
        if value is None:
            area.missing_reason = (
                "not_reported" if area.geography_id in by_geography else "no_model"
            )
            continue
        estimate = _estimate(outcome, selector, [value], release)
        area.value_percent = estimate.value_percent
        area.missing_reason = (
            None if estimate.value_percent is not None else "no_excess"
        )
        area.odds_ratio = estimate.ratio.value if estimate.ratio else None
        area.on_training_support = not estimate.thin_data
    frame.metric = "heat_attributable_share_observed_month"
    return frame


def _default_month(
    session: Session,
    geography_id: str,
    outcome: str,
    selector: str,
    release: str,
    available: list[str],
) -> str | None:
    """The newest month Kenya can show, when this place has it.

    A county's own newest month is often one few others have reached yet, so
    opening on it would leave the map beside it mostly empty.
    """

    if not available:
        return None
    if geography_id == KENYA:
        return available[-1]
    national = _score_units(
        session, _units(session, KENYA, outcome), outcome, selector, release
    )
    shared = [key for key in _available(national) if key in available]
    return shared[-1] if shared else available[-1]


def _available(scored: dict[int, dict[str, CountyMonth]]) -> list[str]:
    """Months that can be shown: for one county, any month it can score.

    For Kenya, a month most counties cannot score yet (the newest pull often
    reaches only a few) would stand for the country on a handful of them, so
    a national month needs at least half the counties.
    """

    counts: dict[str, int] = {}
    for by_month in scored.values():
        for key in by_month:
            counts[key] = counts.get(key, 0) + 1
    needed = (
        1 if len(scored) == 1 else max(1, -(-len(scored) * NATIONAL_COVERAGE // 100))
    )
    return sorted(key for key, count in counts.items() if count >= needed)


def _units(session: Session, geography_id: str, outcome: str) -> list[AdminUnit]:
    if outcome not in OUTCOMES:
        raise OutlookNotAvailable(geography_id)
    query = select(AdminUnit).where(AdminUnit.level == "county")
    if geography_id == KENYA:
        query = query.where(AdminUnit.app_geography_id.like(f"{KENYA}-%"))
    elif geography_id.startswith(f"{KENYA}-"):
        query = query.where(AdminUnit.app_geography_id == geography_id)
    else:
        raise OutlookNotAvailable(geography_id)
    units = list(session.scalars(query.order_by(AdminUnit.name)))
    if not units:
        raise OutlookNotAvailable(geography_id)
    return units


def _resolve_selector(
    outcome: str,
    release: str,
    selector: str | None,
    restriction: OutlookRestriction | None,
) -> tuple[list[Option], str]:
    options = model_selector_options(outcome, release)
    if restriction is not None:
        options = [option for option in options if option.code in restriction.selectors]
    default = (restriction and restriction.default_selector) or DEFAULT_SELECTOR[
        outcome
    ]
    chosen = selector or default
    if chosen not in {option.code for option in options}:
        raise OutlookSelectionInvalid(chosen)
    return options, chosen


def _score_units(
    session: Session,
    units: list[AdminUnit],
    outcome: str,
    selector: str,
    release: str,
) -> dict[int, dict[str, CountyMonth]]:
    cal = calibration(release)
    if outcome == LBW_OUTCOME:
        monthly = _monthly_tmax(session, [unit.id for unit in units])
        return {
            unit.id: _score_lbw(monthly.get(unit.id, {}), cal, unit, selector, release)
            for unit in units
        }
    daily = _daily_tmax(session, [unit.id for unit in units])
    return {
        unit.id: _score_u5(daily.get(unit.id, {}), cal, unit, selector, release)
        for unit in units
    }


def _score_lbw(
    by_month: dict[date, float],
    cal: Calibration,
    unit: AdminUnit,
    window: str,
    release: str,
) -> dict[str, CountyMonth]:
    offsets = cal.offsets.get(unit.app_geography_id or "")
    if offsets is None:
        return {}
    model = dlnm.lbw_model(release)
    p99 = float(model.meta["tmax_percentiles"]["99%"])
    out: dict[str, CountyMonth] = {}
    for target in sorted(by_month):
        months = [_months_before(target, lag) for lag in range(LBW_LAGS)]
        if any(month not in by_month for month in months):
            continue
        scale = [by_month[month] + offsets[month.month - 1] for month in months]
        score = model.score(scale, window)
        rr = (
            dlnm.or_to_rr(value, model.p0)
            for value in (score.ratio, score.ratio_low, score.ratio_high)
        )
        value, low, high = (100 * (1 - 1 / ratio) for ratio in rr)
        used = [scale[lag] for lag in model.lags(window)]
        out[target.strftime("%Y-%m")] = CountyMonth(
            value_percent=value,
            low_percent=low,
            high_percent=high,
            thin_data=_thin(used, p99),
            inputs=[
                ObservedInput(
                    label=month.strftime("%b %Y"),
                    era5_c=round(by_month[month], 2),
                    model_scale_c=round(scale[lag], 2),
                    counted=lag in model.lags(window),
                )
                for lag, month in enumerate(months)
            ],
        )
    return out


def _score_u5(
    by_day: dict[date, float],
    cal: Calibration,
    unit: AdminUnit,
    name: str,
    release: str,
) -> dict[str, CountyMonth]:
    key = unit.app_geography_id or ""
    offsets, reference = cal.offsets.get(key), cal.u5_reference.get(key)
    if offsets is None or reference is None:
        return {}
    models = dlnm.u5_models(release)
    p99 = float(models.meta["tmax_percentiles"]["99%"])
    out: dict[str, CountyMonth] = {}
    for first in sorted({day.replace(day=1) for day in by_day}):
        days = [
            first + timedelta(days=n)
            for n in range(monthrange(first.year, first.month)[1])
        ]
        window = [days[0] - timedelta(days=n) for n in range(U5_LAGS - 1, 0, -1)] + days
        if any(day not in by_day for day in window):
            continue
        scale = {day: by_day[day] + offsets[day.month - 1] for day in window}
        shares = []
        for day in days:
            lags = [scale[day - timedelta(days=lag)] for lag in range(U5_LAGS)]
            score = models.score(lags, reference, name, "heat")
            shares.append(
                tuple(
                    100 * (1 - 1 / ratio)
                    for ratio in (score.ratio, score.ratio_low, score.ratio_high)
                )
            )
        month_values = [scale[day] for day in days]
        out[first.strftime("%Y-%m")] = CountyMonth(
            value_percent=_mean(share[0] for share in shares),
            low_percent=_mean(share[1] for share in shares),
            high_percent=_mean(share[2] for share in shares),
            thin_data=_thin(month_values, p99),
            inputs=[
                ObservedInput(
                    label="Mean daily max",
                    era5_c=round(_mean(by_day[day] for day in days), 2),
                    model_scale_c=round(_mean(month_values), 2),
                    counted=True,
                ),
                ObservedInput(
                    label=f"Days above the {reference:.1f} °C reference",
                    era5_c=None,
                    model_scale_c=float(
                        sum(value > reference for value in month_values)
                    ),
                    counted=True,
                ),
            ],
        )
    return out


def _estimate(
    outcome: str, selector: str, values: list[CountyMonth], release: str
) -> ObservedEstimate:
    """One estimate from one county, or the mean of the counties of Kenya."""

    value = _mean(item.value_percent for item in values)
    low = _mean(item.low_percent for item in values)
    high = _mean(item.high_percent for item in values)
    thin = (
        100 * sum(item.thin_data for item in values) / len(values)
        > THIN_DATA_SHARE_PERCENT
    )
    shown = _shown(outcome, selector, "heat", value, low, high)
    if thin and shown["message"] is None:
        shown["message"] = THIN_DATA
    document = {"outcome": outcome, "p0": dlnm.lbw_model(release).p0}
    ratio = _ratio(document, {"value_pct": value, "low_pct": low, "high_pct": high})
    return ObservedEstimate(
        value_percent=_rounded(shown["value_percent"]),
        low_percent=_rounded(shown["low_percent"]),
        high_percent=_rounded(shown["high_percent"]),
        message=shown["message"],
        ratio=ratio,
        thin_data=thin,
        counties=len(values),
    )


def _monthly_tmax(
    session: Session, unit_ids: list[int]
) -> dict[int, dict[date, float]]:
    rows = session.execute(
        select(
            DistrictClimate.admin_unit_id,
            DistrictClimate.period_month,
            DistrictClimate.value,
            DistrictClimate.observed_days,
            DistrictClimate.expected_days,
            ClimateRun.generated_at,
            ClimateRun.id,
        )
        .join(ClimateRun, ClimateRun.id == DistrictClimate.climate_run_id)
        .where(
            DistrictClimate.admin_unit_id.in_(unit_ids),
            DistrictClimate.variable == MONTHLY_VARIABLE,
            ClimateRun.data_label.in_(OBSERVED_LABELS),
        )
    ).all()
    # A partial month is not a month: the reanalysis rule of input_windows.
    complete = [
        row
        for row in rows
        if row.expected_days and row.observed_days == row.expected_days
    ]
    return _latest(complete, "period_month")


def _daily_tmax(session: Session, unit_ids: list[int]) -> dict[int, dict[date, float]]:
    rows = session.execute(
        select(
            DistrictClimateDay.admin_unit_id,
            DistrictClimateDay.period_date,
            DistrictClimateDay.value,
            ClimateRun.generated_at,
            ClimateRun.id,
        )
        .join(ClimateRun, ClimateRun.id == DistrictClimateDay.climate_run_id)
        .where(
            DistrictClimateDay.admin_unit_id.in_(unit_ids),
            DistrictClimateDay.variable == DAILY_VARIABLE,
            ClimateRun.data_label.in_(OBSERVED_LABELS),
        )
    ).all()
    return _latest(rows, "period_date")


def _latest(rows: Iterable, period: str) -> dict[int, dict[date, float]]:
    """The newest run's value for each unit and period."""

    newest: dict[tuple[int, date], tuple] = {}
    for row in rows:
        key = (row.admin_unit_id, getattr(row, period))
        rank = (row.generated_at is not None, row.generated_at, row.id)
        if key not in newest or rank > newest[key][0]:
            newest[key] = (rank, row.value)
    out: dict[int, dict[date, float]] = {}
    for (unit_id, when), (_, value) in newest.items():
        out.setdefault(unit_id, {})[when] = float(value)
    return out


def _months_before(month: date, count: int) -> date:
    index = month.year * 12 + month.month - 1 - count
    return date(index // 12, index % 12 + 1, 1)


def _thin(values: list[float], p99: float) -> bool:
    share = 100 * sum(value > p99 for value in values) / len(values)
    return share > THIN_DATA_SHARE_PERCENT


def _rounded(value: float | None) -> float | None:
    return None if value is None else round(value, 2)


def _mean(values: Iterable[float]) -> float:
    items = list(values)
    return sum(items) / len(items)


def _reference_note(outcome: str, release: str) -> str:
    if outcome == LBW_OUTCOME:
        mmt = dlnm.lbw_model(release).mmt
        return (
            "Births in the chosen month, scored on the mean daily maximum "
            "temperature of that month and the eight before it. Only months "
            f"warmer than the national minimum-risk temperature ({mmt:.1f} °C) "
            "count."
        )
    return (
        "Each day of the month scored on that day and the three before it, "
        "against the area's own 1991–2020 mean daily maximum; the month is "
        "the mean of its days."
    )
