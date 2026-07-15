from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

ClimateLocationSlug = Literal["madhya-pradesh", "kajiado"]
ClimateTimeframeId = Literal[
    "exposure_3m",
    "recent_12m",
    "historical_window",
    "seasonal",
    "projection",
]

LOCATION_SLUGS: tuple[ClimateLocationSlug, ...] = ("madhya-pradesh", "kajiado")
TIMEFRAME_IDS: tuple[ClimateTimeframeId, ...] = (
    "exposure_3m",
    "recent_12m",
    "historical_window",
    "seasonal",
    "projection",
)

ERA5_SOURCE_NAME = "Copernicus ERA5 single levels"
LBW_DEFAULT_STATE_AREA = "Madhya Pradesh"


@dataclass(frozen=True)
class Location:
    slug: ClimateLocationSlug
    name: str
    country: str
    level: str
    supports_lbw_prediction: bool
    lbw_areas: tuple[str, ...] = ()


@dataclass(frozen=True)
class Timeframe:
    id: ClimateTimeframeId
    label: str
    description: str
    horizon: Literal["short", "medium", "long"]
    resolution: str
    month_count: int | None
    tier: Literal["observed", "seasonal", "projection"]


LOCATIONS: dict[ClimateLocationSlug, Location] = {
    "madhya-pradesh": Location(
        slug="madhya-pradesh",
        name="Madhya Pradesh",
        country="India",
        level="state",
        supports_lbw_prediction=True,
        lbw_areas=(
            "Madhya Pradesh",
            "Bhopal",
            "Chambal",
            "Gwalior",
            "Indore",
            "Jabalpur",
            "Narmadapuram",
            "Rewa",
            "Sagar",
            "Shahdol",
            "Ujjain",
        ),
    ),
    "kajiado": Location(
        slug="kajiado",
        name="Kajiado",
        country="Kenya",
        level="county",
        supports_lbw_prediction=False,
    ),
}

TIMEFRAMES: dict[ClimateTimeframeId, Timeframe] = {
    "exposure_3m": Timeframe(
        id="exposure_3m",
        label="Exposure window (3 months)",
        description=(
            "Last three monthly mean temperatures. Used for heat-LBW prediction."
        ),
        horizon="short",
        resolution="monthly",
        month_count=3,
        tier="observed",
    ),
    "recent_12m": Timeframe(
        id="recent_12m",
        label="Recent year (12 months)",
        description="Trailing twelve complete months of observed monthly heat.",
        horizon="short",
        resolution="monthly",
        month_count=12,
        tier="observed",
    ),
    "historical_window": Timeframe(
        id="historical_window",
        label="Historical window",
        description="Full ingested ERA5 window for this geography.",
        horizon="short",
        resolution="monthly",
        month_count=None,
        tier="observed",
    ),
    "seasonal": Timeframe(
        id="seasonal",
        label="Seasonal outlook (1-6 months ahead)",
        description="Forecast-style seasonal temperatures. Not ingested yet.",
        horizon="medium",
        resolution="seasonal",
        month_count=6,
        tier="seasonal",
    ),
    "projection": Timeframe(
        id="projection",
        label="Long-term projection",
        description="Climate projection scenarios. Not ingested yet.",
        horizon="long",
        resolution="annual",
        month_count=None,
        tier="projection",
    ),
}
