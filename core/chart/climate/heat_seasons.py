"""Official heat seasons and heatwave thresholds, one entry per country.

The values live in ``heat_seasons.json`` so partners can review and update
them without reading code. A season's ``months`` are calendar months and may
wrap the year end (Kenya: December to March).
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

CONFIG_PATH = Path(__file__).with_name("heat_seasons.json")


@dataclass(frozen=True)
class HeatSeason:
    label: str
    months: tuple[int, ...]
    peak_month: int
    source_name: str
    source_uri: str


@dataclass(frozen=True)
class PlanningWindow:
    label: str
    months: tuple[int, ...]
    note: str


@dataclass(frozen=True)
class HeatwaveRule:
    threshold_c: float
    min_run_days: int
    area_thresholds_c: dict[str, float]
    source_name: str
    source_uri: str

    def threshold_for(self, geography_id: str | None) -> float:
        return self.area_thresholds_c.get(geography_id or "", self.threshold_c)


@lru_cache(maxsize=1)
def _config() -> dict:
    return json.loads(CONFIG_PATH.read_text())


def heat_season(country_code: str) -> HeatSeason | None:
    entry = _config().get(country_code.upper(), {}).get("season")
    if entry is None:
        return None
    return HeatSeason(
        label=entry["label"],
        months=tuple(entry["months"]),
        peak_month=entry["peak_month"],
        source_name=entry["source_name"],
        source_uri=entry["source_uri"],
    )


def planning_window(country_code: str) -> PlanningWindow | None:
    entry = _config().get(country_code.upper(), {}).get("planning_window")
    if entry is None:
        return None
    return PlanningWindow(
        label=entry["label"], months=tuple(entry["months"]), note=entry["note"]
    )


def heatwave_rule(country_code: str) -> HeatwaveRule | None:
    entry = _config().get(country_code.upper(), {}).get("heatwave")
    if entry is None:
        return None
    return HeatwaveRule(
        threshold_c=float(entry["threshold_c"]),
        min_run_days=int(entry["min_run_days"]),
        area_thresholds_c={
            key: float(value)
            for key, value in entry.get("area_thresholds_c", {}).items()
        },
        source_name=entry["source_name"],
        source_uri=entry["source_uri"],
    )
