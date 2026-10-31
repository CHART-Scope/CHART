"""ERA5-Land temperature and heatwave days for the Explore map.

A context layer, not a model input: values come from the ``land_*`` monthly
variables a ``--product era5-land`` backfill stores (``chart.climate.history``),
which no health scorer reads. Each area shows its own aggregate; an area
without a month shows as not reported, never a neighbour's value.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from chart.risk.schemas import MapResponse
from chart.risk.service import load_map_view
from chart.shared.db.models import ClimateRun, DataLabel, DistrictClimate

from .service import OutlookSelectionInvalid

#: layer -> (stored variable, unit)
LAYERS = {
    "tmax": ("land_tmax_monthly_mean_c", "degC"),
    "heat_days": ("land_heatwave_days", "days"),
}
OBSERVED_LABELS = (DataLabel.observed, DataLabel.reanalysis)


class ClimateLayerResponse(MapResponse):
    available_months: list[str] = []
    source: str = "Copernicus ERA5-Land (0.1°), area mean of daily maxima"


def load_climate_layer(
    session: Session, geography_id: str, layer: str, month: str | None
) -> ClimateLayerResponse:
    if layer not in LAYERS:
        raise OutlookSelectionInvalid(layer)
    variable, unit = LAYERS[layer]
    frame = load_map_view(session, geography_id, None, with_values=False)
    unit_ids = [area.admin_unit_id for area in frame.areas]
    newest: dict[tuple[int, date], tuple[tuple, float]] = {}
    for row in session.execute(
        select(
            DistrictClimate.admin_unit_id,
            DistrictClimate.period_month,
            DistrictClimate.value,
            ClimateRun.generated_at,
            ClimateRun.id,
        )
        .join(ClimateRun, ClimateRun.id == DistrictClimate.climate_run_id)
        .where(
            DistrictClimate.admin_unit_id.in_(unit_ids),
            DistrictClimate.variable == variable,
            ClimateRun.data_label.in_(OBSERVED_LABELS),
        )
    ):
        key = (row.admin_unit_id, row.period_month)
        rank = (row.generated_at is not None, row.generated_at, row.id)
        if key not in newest or rank > newest[key][0]:
            newest[key] = (rank, float(row.value))
    available = sorted({held.strftime("%Y-%m") for _, held in newest})
    if month is not None and month not in available:
        raise OutlookSelectionInvalid(month)
    chosen = month or (available[-1] if available else None)
    for area in frame.areas:
        area.odds_ratio = None
        area.on_training_support = None
        found = newest.get(
            (area.admin_unit_id, date.fromisoformat(f"{chosen}-01"))
            if chosen
            else (area.admin_unit_id, date.min)
        )
        area.value_percent = None if found is None else round(found[1], 2)
        area.missing_reason = None if found is not None else "not_reported"
    data = frame.model_dump()
    data.update(
        month=chosen,
        metric=f"climate_{layer}",
        unit=unit,
        available_months=available,
    )
    return ClimateLayerResponse.model_validate(data)
