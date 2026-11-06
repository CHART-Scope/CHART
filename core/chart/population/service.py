"""Population per CHART place, from the WorldPop file the script writes.

``worldpop_2025.json`` is produced by ``core/scripts/worldpop_population.py``
(WorldPop Global2 R2025A, 1 km, CC BY 4.0) and holds, per configured place,
the total, children under five, women 15-49 and the area. It is reference
data: read once, never computed on a request.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel
from sqlalchemy.orm import Session

from chart.risk.schemas import MapResponse
from chart.risk.service import load_map_view

DATA = Path(__file__).with_name("worldpop_2025.json")
MEASURES = {
    "total": "People",
    "under5": "Children under five",
    "women_15_49": "Women aged 15-49",
}


class PlacePopulation(BaseModel):
    total: int
    under5: int
    women_15_49: int
    area_km2: float


class PopulationMap(MapResponse):
    measure: str
    measure_label: str
    #: The frame itself, when the file covers it.
    place: PlacePopulation | None = None
    counts: dict[str, PlacePopulation] = {}
    source: str
    source_uri: str
    license: str
    citation: str
    year: int


class PopulationNotAvailable(LookupError):
    pass


@lru_cache(maxsize=1)
def _document() -> dict:
    if not DATA.is_file():
        raise PopulationNotAvailable("population data is not installed")
    return json.loads(DATA.read_text())


def place_population(geography_id: str) -> PlacePopulation | None:
    found = _document()["places"].get(geography_id)
    return PlacePopulation(**found) if found else None


def load_population_map(
    session: Session, geography_id: str, measure: str
) -> PopulationMap:
    """The frame's areas shaded by people per km2 of ``measure``.

    Density, not counts, is shaded: a large rural constituency would
    otherwise outshine a crowded small one. Counts travel in ``counts``.
    """
    if measure not in MEASURES:
        raise ValueError(measure)
    document = _document()
    frame = load_map_view(session, geography_id, None, with_values=False)
    counts: dict[str, PlacePopulation] = {}
    for area in frame.areas:
        area.odds_ratio = None
        area.on_training_support = None
        found = place_population(area.geography_id or "")
        if found is None or not found.area_km2:
            area.value_percent = None
            area.missing_reason = "not_reported"
            continue
        counts[area.geography_id or ""] = found
        area.value_percent = round(getattr(found, measure) / found.area_km2, 1)
        area.missing_reason = None
    data = frame.model_dump()
    data.update(
        metric=f"population_density_{measure}",
        unit="people_per_km2",
        measure=measure,
        measure_label=MEASURES[measure],
        place=place_population(geography_id),
        counts=counts,
        source=document["source"],
        source_uri=document["source_uri"],
        license=document["license"],
        citation=document["citation"],
        year=document["year"],
    )
    return PopulationMap.model_validate(data)
