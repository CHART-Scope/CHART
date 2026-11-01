"""Score each place's forecast months with the models its observed months use.

Kenya (counties and constituencies) goes through the calibrated national
curves in ``chart.heat_outlook.observed``; India through its live R models,
districts with their division's (``get_active_model_mapping`` inherits).

Low birth weight reads monthly temperatures with lags, so a forecast month is
scored with the forecast for it and the observed (or forecast) months before.
Under-five reads daily temperatures, which a monthly forecast does not give:
India's release scores one temperature repeated over its lags (its
interactive profile); Kenya's is scored by shifting each 2006-2016 year's
daily series for that month by the forecast's departure from the normal and
averaging the years (a delta method). Each month is scored at the central,
coolest and warmest system so a range travels with every value.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import date, timedelta

from sqlalchemy.orm import Session, sessionmaker

from chart.health_impact.derivation import attributable_fraction_milli
from chart.heat_outlook import observed
from chart.heat_outlook.service import (
    DEFAULT_SELECTOR,
    LBW_OUTCOME,
    NO_EXCESS_HEAT,
    NO_EXCESS_LBW,
    U5_OUTCOME,
    legacy_observed_supported,
    outlook_release,
)
from chart.model_registry.service import get_active_model_mapping
from chart.shared.db.models import AdminUnit

from .model_scoring import score_association_model, score_lbw_model

YEARS = range(2006, 2017)


def score_places(
    factory: sessionmaker[Session],
    country: str,
    units: dict[str, AdminUnit],
    places: dict[str, dict],
    months: list[date],
    *,
    log: Callable[[str], None] = print,
) -> None:
    scored = 0
    with factory() as session:
        for key, place in places.items():
            unit = units[key]
            for outcome in (LBW_OUTCOME, U5_OUTCOME):
                try:
                    if legacy_observed_supported(session, key, outcome):
                        result = _kenya(session, unit, outcome, place, months)
                    else:
                        result = _live(session, unit, outcome, place, months)
                except Exception as error:  # noqa: BLE001 - one place must not stop all
                    log(f"{key} {outcome}: not scored ({error})")
                    continue
                if result:
                    place[outcome] = result
                    scored += 1
    log(f"{country}: scored {scored} place-outcomes for {len(months)} months")


def _triple(values: list[float | None]) -> list[float | None]:
    """[central, low, high] from the central, coolest and warmest scores."""
    central, *others = values
    known = [value for value in values if value is not None]
    if central is None or not known:
        return [central, None, None]
    return [round(central, 2), round(min(known), 2), round(max(known), 2)]


def _share(estimate: observed.ObservedEstimate) -> float | None:
    """The estimate's share, 0 where the guide hides a negative one.

    A month the model scores below a risk ratio of 1 has no heat excess; the
    observed view says so in words, but a forecast month left empty would
    read as missing data. India's scoring floors the same case at 0.
    """
    if estimate.value_percent is None and estimate.message in (
        NO_EXCESS_LBW,
        NO_EXCESS_HEAT,
    ):
        return 0.0
    return estimate.value_percent


def _kenya(session, unit, outcome, place, months) -> dict | None:
    release = outlook_release()
    cal = observed.calibration(release)
    selector = DEFAULT_SELECTOR[outcome]
    temps = place["tmax_c"]
    values: dict[str, list[float | None]] = {}
    if outcome == LBW_OUTCOME:
        history = observed._monthly_tmax(session, [unit.id]).get(unit.id, {})
        for month in months:
            key = month.strftime("%Y-%m")
            if key not in temps:
                continue
            shares = []
            for variant in range(3):
                series = dict(history)
                for other in months:
                    other_key = other.strftime("%Y-%m")
                    if other_key in temps and other <= month:
                        series[other] = temps[other_key][variant]
                found = observed._score_lbw(series, cal, unit, selector, release)
                shares.append(
                    _share(observed._estimate(outcome, selector, [found[key]], release))
                    if key in found
                    else None
                )
            values[key] = _triple(shares)
    else:
        daily = observed._daily_tmax(session, [unit.id]).get(unit.id, {})
        normal = place["normal_c"]
        for month in months:
            key = month.strftime("%Y-%m")
            if key not in temps:
                continue
            shares = []
            for variant in range(3):
                # Scored before the document is saved: months are int keys.
                delta = temps[key][variant] - normal[month.month]
                years: list[observed.CountyMonth] = []
                for year in YEARS:
                    first = date(year, month.month, 1)
                    following = date(
                        year + (month.month == 12), month.month % 12 + 1, 1
                    )
                    window = [first - timedelta(days=n) for n in range(3, 0, -1)]
                    day = first
                    while day < following:
                        window.append(day)
                        day += timedelta(days=1)
                    if any(day not in daily for day in window):
                        continue
                    shifted = {day: daily[day] + delta for day in window}
                    found = observed._score_u5(shifted, cal, unit, selector, release)
                    years.extend(found.values())
                shares.append(
                    _share(observed._estimate(outcome, selector, years, release))
                    if years
                    else None
                )
            values[key] = _triple(shares)
    return {"selector": selector, "values": {selector: values}} if values else None


def _live(session, unit, outcome, place, months) -> dict | None:
    mapping = get_active_model_mapping(session, admin_unit_id=unit.id, outcome=outcome)
    if mapping is None:
        return None
    temps = place["tmax_c"]
    history = observed._monthly_tmax(session, [unit.id]).get(unit.id, {})

    def temperature(month: date, variant: int) -> float | None:
        key = month.strftime("%Y-%m")
        if key in temps:
            return temps[key][variant]
        return history.get(month)

    def previous(month: date, back: int) -> date:
        index = month.year * 12 + month.month - 1 - back
        return date(index // 12, index % 12 + 1, 1)

    if outcome == LBW_OUTCOME:
        windows = tuple(mapping.validated_pregnancy_windows) or (1,)
        by_window: dict[str, dict[str, list[float | None]]] = {}
        for window in windows:
            code = f"window_{window}"
            for month in months:
                key = month.strftime("%Y-%m")
                if key not in temps:
                    continue
                shares: list[float | None] = []
                for variant in range(3):
                    found = [
                        temperature(previous(month, back), variant) for back in range(3)
                    ]
                    lags = [value for value in found if value is not None]
                    if len(lags) != 3:
                        shares.append(None)
                        continue
                    score = score_lbw_model(
                        mapping,
                        pregnancy_window=window,
                        temperatures_c=(lags[0], lags[1], lags[2]),
                    )
                    shares.append(
                        attributable_fraction_milli(
                            score.odds_ratio,
                            temperature_c=max(lags),
                            reference_temperature_c=score.reference_temperature_c,
                        )
                        / 10
                    )
                by_window.setdefault(code, {})[key] = _triple(shares)
        default = f"window_{1 if 1 in windows else windows[0]}"
        return {"selector": default, "values": by_window} if by_window else None

    values: dict[str, list[float | None]] = {}
    for month in months:
        key = month.strftime("%Y-%m")
        if key not in temps:
            continue
        shares = []
        for variant in range(3):
            value = temps[key][variant]
            association = score_association_model(
                mapping,
                outcome=outcome,
                exposure_profiles_c=((value, value, value, value),),
            )
            shares.append(
                attributable_fraction_milli(
                    association.estimate,
                    temperature_c=value,
                    reference_temperature_c=association.reference_temperature_c,
                )
                / 10
            )
        values[key] = _triple(shares)
    return {"selector": "all", "values": {"all": values}} if values else None
