from __future__ import annotations

import hashlib
import json
from datetime import date, datetime, timezone

import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import (
    AdminUnit,
    ClimateRun,
    DataLabel,
    DataSource,
    DistrictClimate,
    Geography,
    Provenance,
)

ERA5_DATA_SOURCE_NAME = "Copernicus ERA5 single levels"


def _touch_data_source(data_source: DataSource) -> None:
    data_source.last_refreshed_at = datetime.now(timezone.utc)


def _get_or_create_era5_data_source(session: Session, geography_id: int) -> DataSource:
    data_source = session.scalar(
        select(DataSource).where(
            DataSource.name == ERA5_DATA_SOURCE_NAME,
            DataSource.geography_id == geography_id,
        )
    )
    if data_source is None:
        data_source = DataSource(
            name=ERA5_DATA_SOURCE_NAME,
            kind="reanalysis",
            cadence="monthly",
            geography_id=geography_id,
        )
        session.add(data_source)
        session.flush()
    return data_source


ERA5_VARIABLES = (
    ("tmax_monthly_mean_c", "degC"),
    ("tmax_monthly_max_c", "degC"),
    ("heatwave_days", "days"),
)


def _parse_month(value) -> date:
    ts = pd.to_datetime(value)
    return date(int(ts.year), int(ts.month), 1)


def ensure_mvp_geographies(session: Session) -> dict[str, tuple[Geography, AdminUnit]]:
    """Seed the two MVP geographies used by era5_heat presets."""
    from era5_heat.districts import PRESETS

    out: dict[str, tuple[Geography, AdminUnit]] = {}
    for slug, preset in PRESETS.items():
        geography = session.scalar(select(Geography).where(Geography.slug == slug))
        if geography is None:
            geography = Geography(slug=slug, country=preset.country, name=preset.name)
            session.add(geography)
            session.flush()

        admin_unit = session.scalar(
            select(AdminUnit).where(
                AdminUnit.geography_id == geography.id,
                AdminUnit.code == slug,
            )
        )
        if admin_unit is None:
            north, west, south, east = preset.bbox
            admin_unit = AdminUnit(
                geography_id=geography.id,
                level="state" if slug == "madhya-pradesh" else "county",
                code=slug,
                name=preset.name,
                bbox_north=north,
                bbox_west=west,
                bbox_south=south,
                bbox_east=east,
                note=preset.note,
            )
            session.add(admin_unit)
            session.flush()

        out[slug] = (geography, admin_unit)

    return out


def load_era5_monthly_frame(
    session: Session,
    *,
    preset_slug: str,
    df: pd.DataFrame,
    meta: dict,
    csv_path: str,
) -> ClimateRun:
    """Upsert one observed ERA5 run and monthly district_climate rows."""
    geographies = ensure_mvp_geographies(session)
    if preset_slug not in geographies:
        raise KeyError(f"unknown preset slug: {preset_slug}")

    _, admin_unit = geographies[preset_slug]
    input_hash = hashlib.sha256(json.dumps(meta, sort_keys=True).encode()).hexdigest()

    existing = session.scalar(
        select(ClimateRun).where(ClimateRun.input_hash == input_hash)
    )
    geography = geographies[preset_slug][0]
    data_source = _get_or_create_era5_data_source(session, geography.id)

    if existing is not None:
        _touch_data_source(data_source)
        return existing

    provenance = Provenance(
        source_uri=csv_path,
        input_hash=input_hash,
        license="Copernicus CDS terms",
    )
    session.add(provenance)
    session.flush()

    status = meta.get("data_status", "reanalysis")
    status_map = {
        "observed_reanalysis": DataLabel.reanalysis,
        "sample": DataLabel.sample,
        "observed": DataLabel.observed,
        "modeled": DataLabel.modeled,
        "reanalysis": DataLabel.reanalysis,
    }
    data_label = status_map.get(status, DataLabel.reanalysis)

    climate_run = ClimateRun(
        data_source_id=data_source.id,
        provenance_id=provenance.id,
        tier="observed",
        input_hash=input_hash,
        scenario=None,
        resolution="ERA5 0.25 deg bbox aggregate",
        data_label=data_label,
        window_start_year=meta.get("window", {}).get("start_year"),
        window_end_year=meta.get("window", {}).get("end_year"),
        generated_at=(
            datetime.fromisoformat(meta["generated_at"])
            if meta.get("generated_at")
            else None
        ),
    )
    session.add(climate_run)
    session.flush()

    for _, row in df.iterrows():
        period_month = _parse_month(row["month"])
        for variable, unit in ERA5_VARIABLES:
            value = float(row[variable])
            session.add(
                DistrictClimate(
                    admin_unit_id=admin_unit.id,
                    climate_run_id=climate_run.id,
                    period_month=period_month,
                    variable=variable,
                    value=value,
                    agg_method="bbox_mean",
                    unit=unit,
                )
            )

    _touch_data_source(data_source)
    return climate_run
