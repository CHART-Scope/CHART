"""Serve the saved six-month forecasts (``chart.climate.seasonal_forecast``).

Read-only: the forecast is built once per C3S issue and saved; a request
only looks values up. A place shows its own forecast or nothing.
"""

from __future__ import annotations

from pydantic import BaseModel
from sqlalchemy.orm import Session

from chart.climate.seasonal_forecast import latest_document
from chart.risk.schemas import MapResponse
from chart.heat_outlook.schemas import Ratio
from chart.risk.service import load_map_view
from chart.shared.db.models import AppGeography

from .service import OutlookNotAvailable, OutlookSelectionInvalid


class ForecastMonth(BaseModel):
    month: str
    tmax_c: float | None = None
    tmax_low_c: float | None = None
    tmax_high_c: float | None = None
    value_percent: float | None = None
    low_percent: float | None = None
    high_percent: float | None = None
    #: The model's ratio and 95% interval at the central forecast, with its
    #: precision; absent for issues built before it was kept.
    ratio: Ratio | None = None


class ForecastResponse(BaseModel):
    geography_id: str
    outcome: str
    issue: str
    selector: str | None
    selectors: list[str]
    months: list[ForecastMonth]
    systems: list[str]
    source: str
    source_uri: str
    method: str


class ForecastMap(MapResponse):
    issue: str
    months: list[str]
    #: Each area's [low, high] share for the month: coolest and warmest system.
    ranges: dict[str, list[float | None]] = {}
    tmax_c: dict[str, float] = {}


def _document(session: Session, geography_id: str) -> dict:
    geography = session.get(AppGeography, geography_id)
    if geography is None:
        raise OutlookNotAvailable(geography_id)
    document = latest_document(geography.country_code)
    if document is None:
        raise OutlookNotAvailable(geography_id)
    return document


def _selected(place: dict, outcome: str, selector: str | None):
    scored = place.get(outcome)
    if not scored:
        return None, [], {}
    chosen = selector or scored["selector"]
    if chosen not in scored["values"]:
        raise OutlookSelectionInvalid(chosen)
    return chosen, sorted(scored["values"]), scored["values"][chosen]


def _ratios(place: dict, outcome: str, selector: str | None) -> dict:
    scored = place.get(outcome) or {}
    return scored.get("ratios", {}).get(selector or scored.get("selector"), {})


def load_forecast(
    session: Session, geography_id: str, outcome: str, selector: str | None
) -> ForecastResponse:
    document = _document(session, geography_id)
    place = document["places"].get(geography_id)
    if place is None:
        raise OutlookNotAvailable(geography_id)
    chosen, selectors, values = _selected(place, outcome, selector)
    ratios = _ratios(place, outcome, chosen)
    months = []
    for month in document["months"]:
        temps = place["tmax_c"].get(month, [None, None, None])
        share = values.get(month, [None, None, None])
        months.append(
            ForecastMonth(
                month=month,
                tmax_c=temps[0],
                tmax_low_c=temps[1],
                tmax_high_c=temps[2],
                value_percent=share[0],
                low_percent=share[1],
                high_percent=share[2],
                ratio=ratios.get(month),
            )
        )
    return ForecastResponse(
        geography_id=geography_id,
        outcome=outcome,
        issue=document["issue"],
        selector=chosen,
        selectors=selectors,
        months=months,
        systems=document["systems"],
        source=document["source"],
        source_uri=document["source_uri"],
        method=document["method"],
    )


def load_forecast_map(
    session: Session,
    geography_id: str,
    outcome: str,
    month: str | None,
    selector: str | None,
) -> ForecastMap:
    document = _document(session, geography_id)
    chosen_month = month or document["months"][0]
    if chosen_month not in document["months"]:
        raise OutlookSelectionInvalid(chosen_month)
    frame = load_map_view(session, geography_id, None, with_values=False)
    ranges: dict[str, list[float | None]] = {}
    temps: dict[str, float] = {}
    for area in frame.areas:
        area.odds_ratio = None
        area.on_training_support = None
        area.value_percent = None
        place = document["places"].get(area.geography_id or "")
        if place is None:
            area.missing_reason = "not_reported"
            continue
        if chosen_month in place["tmax_c"]:
            temps[area.geography_id or ""] = place["tmax_c"][chosen_month][0]
        try:
            _, _, values = _selected(place, outcome, selector)
        except OutlookSelectionInvalid:
            values = {}
        share = values.get(chosen_month)
        if not share or share[0] is None:
            area.missing_reason = "no_model" if not values else "not_reported"
            continue
        area.value_percent = share[0]
        area.missing_reason = None
        ranges[area.geography_id or ""] = [share[1], share[2]]
    data = frame.model_dump()
    data.update(
        month=chosen_month,
        metric="heat_attributable_share_forecast_month",
        issue=document["issue"],
        months=document["months"],
        ranges=ranges,
        tmax_c=temps,
    )
    return ForecastMap.model_validate(data)
