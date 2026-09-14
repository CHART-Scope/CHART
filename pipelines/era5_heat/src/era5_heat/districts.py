"""Preset districts for the initial focus areas.

bbox order: (north, west, south, east), degrees. Matches the CDS
`area` convention. Northern Hemisphere has north > south as positive
numbers; Southern Hemisphere uses negative latitudes with north > south
still holding (e.g. -1.0 > -3.1).
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class District:
    name: str
    bbox: tuple[float, float, float, float]
    country: str
    note: str = ""


PRESETS: dict[str, District] = {
    "madhya-pradesh": District(
        name="Madhya Pradesh",
        bbox=(26.87, 74.02, 21.08, 82.84),
        country="India",
        note="State-level bbox. Large area (~308k km^2); aggregated Tmax averages across diverse climates.",
    ),
    "kajiado": District(
        name="Kajiado",
        bbox=(-1.00, 36.05, -3.10, 37.95),
        country="Kenya",
        note="County south of Nairobi. Southern-Hemisphere latitudes are negative; north > south still holds.",
    ),
}


def get(slug: str) -> District:
    if slug not in PRESETS:
        avail = ", ".join(sorted(PRESETS))
        raise KeyError(f"unknown preset '{slug}'. Available: {avail}")
    return PRESETS[slug]


def list_slugs() -> list[str]:
    return sorted(PRESETS)
