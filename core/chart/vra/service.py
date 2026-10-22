"""VRA workflows: catalogue sync, value uploads, climate-derived hazard, runs, reads.

An assessment always covers the child areas of a frame geography, framed the
way the dashboard risk map frames them (``resolve_map_frame``): Madhya
Pradesh's divisions, Kenya's counties, or a leaf's siblings. Nothing here is
country-specific.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import logging
import math
from datetime import date, datetime, timezone
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from chart.risk.schemas import MapResponse
from chart.risk.service import load_map_view, resolve_map_frame
from chart.shared.db.models import (
    AdminUnit,
    AppGeography,
    ClimateRun,
    DataLabel,
    DataSource,
    DistrictClimate,
    VraIndicator,
    VraIndicatorValue,
    VraIngestion,
    VraResult,
    VraResultIndicator,
    VraRun,
)

from . import scoring
from .schemas import (
    AreaAssessment,
    AreaDetailResponse,
    AreaIndicator,
    AssessmentResponse,
    Components,
    Coverage,
    CoverageIndicator,
    CoverageResponse,
    Driver,
    IndicatorItem,
    IngestionItem,
    IngestionResult,
    Rejection,
    RunSummary,
)

logger = logging.getLogger(__name__)

CATALOGUE_PATH = Path(__file__).with_name("catalogue.json")
TEMPLATE_COLUMNS = (
    "area_code",
    "area_name",
    "indicator_code",
    "value",
    "vintage",
    "source_name",
    "source_url",
    "notes",
)
REQUIRED_COLUMNS = ("area_code", "indicator_code", "value", "vintage")
#: Monthly ERA5 variable summed or averaged over the latest 12 complete months.
COMPUTED_HAZARD = {
    "haz.heatwave_days_12m": ("heatwave_days", "sum"),
    "haz.tmax_monthly_max_12m": ("tmax_monthly_max_c", "mean"),
}
WINDOW_MONTHS = 12


class VraError(Exception):
    def __init__(self, code: str, status_code: int) -> None:
        super().__init__(code)
        self.code = code
        self.status_code = status_code


# --- catalogue -------------------------------------------------------------


def sync_catalogue(session: Session) -> int:
    """Upsert the bundled catalogue on ``code``. Idempotent; returns the count."""

    raw = json.loads(CATALOGUE_PATH.read_text(encoding="utf-8"))
    version = raw["version"]
    existing = {row.code: row for row in session.scalars(select(VraIndicator))}
    now = datetime.now(timezone.utc)
    for item in raw["indicators"]:
        row = existing.get(item["code"])
        if row is None:
            row = VraIndicator(code=item["code"])
            session.add(row)
        for name in (
            "component",
            "category",
            "name",
            "unit",
            "direction_to_risk",
            "route",
            "status",
            "rationale",
            "ceew_ref",
        ):
            setattr(row, name, item[name])
        row.catalogue_version = version
        row.synced_at = now
    session.flush()
    return len(raw["indicators"])


def _catalogue(session: Session) -> list[VraIndicator]:
    rows = list(session.scalars(select(VraIndicator).order_by(VraIndicator.id)))
    if not rows:
        # A database migrated after setup has an empty catalogue until the next
        # startup sync; fill it on first use rather than answering empty.
        sync_catalogue(session)
        session.commit()
        rows = list(session.scalars(select(VraIndicator).order_by(VraIndicator.id)))
    return rows


def list_indicators(session: Session) -> list[IndicatorItem]:
    return [
        IndicatorItem(
            code=row.code,
            component=row.component,
            category=row.category,
            name=row.name,
            unit=row.unit,
            direction_to_risk=row.direction_to_risk,
            route=row.route,
            status=row.status,
            rationale=row.rationale,
        )
        for row in _catalogue(session)
    ]


# --- frame and areas -------------------------------------------------------


def frame_areas(
    session: Session, geography_id: str
) -> tuple[AppGeography, list[tuple[AdminUnit, AppGeography]]]:
    """The frame for ``geography_id`` and its child areas that have an admin unit."""

    frame = resolve_map_frame(session, geography_id)
    rows = session.execute(
        select(AdminUnit, AppGeography)
        .join(AppGeography, AppGeography.id == AdminUnit.app_geography_id)
        .where(AppGeography.parent_id == frame.id)
        .order_by(AppGeography.sort_order, AdminUnit.name)
    ).all()
    return frame, [(unit, geography) for unit, geography in rows]


def _latest_values(
    session: Session, unit_ids: list[int]
) -> dict[tuple[int, int], VraIndicatorValue]:
    """Newest vintage per (indicator, area). Vintages start with a year."""

    latest: dict[tuple[int, int], VraIndicatorValue] = {}
    rows = session.scalars(
        select(VraIndicatorValue)
        .where(VraIndicatorValue.admin_unit_id.in_(unit_ids))
        .order_by(VraIndicatorValue.vintage.desc(), VraIndicatorValue.id.desc())
    )
    for row in rows:
        latest.setdefault((row.indicator_id, row.admin_unit_id), row)
    return latest


def _upsert_value(session: Session, **fields) -> None:
    row = session.scalar(
        select(VraIndicatorValue).where(
            VraIndicatorValue.indicator_id == fields["indicator_id"],
            VraIndicatorValue.admin_unit_id == fields["admin_unit_id"],
            VraIndicatorValue.vintage == fields["vintage"],
        )
    )
    if row is None:
        session.add(VraIndicatorValue(**fields))
        return
    for name, value in fields.items():
        setattr(row, name, value)
    row.updated_at = datetime.now(timezone.utc)


# --- computed hazard -------------------------------------------------------


def _shift_months(month: date, delta: int) -> date:
    index = month.year * 12 + month.month - 1 + delta
    return date(index // 12, index % 12 + 1, 1)


def refresh_computed_hazard(session: Session, unit_ids: list[int]) -> None:
    """Recompute the climate-derived hazard indicators from ``district_climate``.

    The window is the 12 months ending at the latest complete observed month
    held for any area in the frame, so every area is measured over the same
    months. An area missing any month in that window gets no value (and any
    older window's value is removed), rather than a value over fewer months.
    Sample (fixture) data is never used.
    """

    indicators = {
        row.code: row
        for row in session.scalars(
            select(VraIndicator).where(VraIndicator.code.in_(COMPUTED_HAZARD))
        )
    }
    for code, (variable, how) in COMPUTED_HAZARD.items():
        indicator = indicators.get(code)
        if indicator is None or not unit_ids:
            continue
        rows = session.execute(
            select(DistrictClimate, ClimateRun, DataSource.source_uri)
            .join(ClimateRun, ClimateRun.id == DistrictClimate.climate_run_id)
            .join(DataSource, DataSource.id == ClimateRun.data_source_id)
            .where(
                DistrictClimate.admin_unit_id.in_(unit_ids),
                DistrictClimate.variable == variable,
                ClimateRun.tier == "observed",
                ClimateRun.data_label != DataLabel.sample,
            )
            .order_by(ClimateRun.generated_at.desc().nulls_last(), ClimateRun.id.desc())
        ).all()
        # Newest run wins for each area and month.
        months: dict[
            tuple[int, date], tuple[DistrictClimate, ClimateRun, str | None]
        ] = {}
        for climate, run, source_uri in rows:
            complete = (
                climate.observed_days is None
                or climate.expected_days is None
                or climate.observed_days == climate.expected_days
            )
            if complete:
                months.setdefault(
                    (climate.admin_unit_id, climate.period_month),
                    (climate, run, source_uri),
                )
        end = max((month for _, month in months), default=None)
        window = (
            [_shift_months(end, -offset) for offset in range(WINDOW_MONTHS - 1, -1, -1)]
            if end is not None
            else []
        )
        vintage = f"{window[0]:%Y-%m}/{window[-1]:%Y-%m}" if window else None
        session.execute(
            delete(VraIndicatorValue).where(
                VraIndicatorValue.indicator_id == indicator.id,
                VraIndicatorValue.admin_unit_id.in_(unit_ids),
                VraIndicatorValue.vintage != (vintage or ""),
            )
        )
        if vintage is None:
            continue
        for unit_id in unit_ids:
            found = [months.get((unit_id, month)) for month in window]
            if any(item is None for item in found):
                continue
            series = [item[0].value for item in found if item is not None]
            last = found[-1]
            assert last is not None
            _, run, source_uri = last
            _upsert_value(
                session,
                indicator_id=indicator.id,
                admin_unit_id=unit_id,
                vintage=vintage,
                value=sum(series) if how == "sum" else sum(series) / len(series),
                method="computed",
                quality_flags={
                    "months": WINDOW_MONTHS,
                    "variable": variable,
                    "aggregation": how,
                    "climate_run_ids": sorted(
                        {item[1].id for item in found if item is not None}
                    ),
                },
                source_name=run.source_name,
                source_url=source_uri,
                notes=None,
                ingestion_id=None,
                climate_run_id=run.id,
            )
    session.flush()


# --- uploads ---------------------------------------------------------------


def template_csv(session: Session, geography_id: str) -> str:
    """One blank row per child area and indicator that is entered by hand."""

    _, areas = frame_areas(session, geography_id)
    indicators = [
        row
        for row in _catalogue(session)
        if row.route in ("upload", "manual") and row.status != "dropped"
    ]
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\n")
    writer.writerow(TEMPLATE_COLUMNS)
    for unit, _ in areas:
        for indicator in indicators:
            writer.writerow([unit.code, unit.name, indicator.code, "", "", "", "", ""])
    return out.getvalue()


def _check_row(
    row: dict[str, str],
    areas: dict[str, AdminUnit],
    indicators: dict[str, VraIndicator],
) -> tuple[str | None, float | None]:
    """A rejection reason, or None and the parsed value."""

    area_code = (row.get("area_code") or "").strip().lower()
    indicator_code = (row.get("indicator_code") or "").strip()
    if area_code not in areas:
        return f"area_code '{area_code}' is not an area of this frame", None
    indicator = indicators.get(indicator_code)
    if indicator is None:
        return f"indicator_code '{indicator_code}' is not in the catalogue", None
    if indicator.status == "dropped":
        return f"indicator '{indicator_code}' is dropped from the catalogue", None
    if indicator.route == "computed":
        return f"indicator '{indicator_code}' is computed by CHART", None
    try:
        value = float((row.get("value") or "").strip())
    except ValueError:
        return f"value '{row.get('value')}' is not a number", None
    if not math.isfinite(value):
        return f"value '{row.get('value')}' is not a number", None
    if indicator.unit.startswith("%") and not 0 <= value <= 100:
        return f"value {value:g} is outside 0-100 for a percentage", None
    if not (row.get("vintage") or "").strip():
        return "vintage is required", None
    return None, value


def ingest_csv(
    session: Session,
    geography_id: str,
    text: str,
    file_name: str | None,
    user_id: str | None,
) -> IngestionResult:
    """Validate an upload row by row and upsert the valid rows.

    Blank values are skipped. If no row is valid the ingestion is recorded as
    failed and no value is written.
    """

    frame, area_rows = frame_areas(session, geography_id)
    areas = {unit.code.lower(): unit for unit, _ in area_rows}
    indicators = {row.code: row for row in _catalogue(session)}
    reader = csv.DictReader(io.StringIO(text.lstrip("﻿")))
    header = [name.strip() for name in reader.fieldnames or []]
    if any(column not in header for column in REQUIRED_COLUMNS):
        raise VraError("VRA_CSV_HEADER_INVALID", 422)
    reader.fieldnames = header

    accepted: list[tuple[VraIndicator, AdminUnit, float, dict[str, str]]] = []
    rejections: list[Rejection] = []
    seen: set[tuple[str, str, str]] = set()
    for line, row in enumerate(reader, start=2):
        if not (row.get("value") or "").strip():
            continue
        reason, value = _check_row(row, areas, indicators)
        key = (
            (row.get("indicator_code") or "").strip(),
            (row.get("area_code") or "").strip().lower(),
            (row.get("vintage") or "").strip(),
        )
        if reason is None and key in seen:
            reason = "duplicate of an earlier row (same area, indicator and vintage)"
        if reason is not None or value is None:
            rejections.append(Rejection(row=line, reason=reason or "invalid row"))
            continue
        seen.add(key)
        accepted.append((indicators[key[0]], areas[key[1]], value, row))

    ingestion = VraIngestion(
        frame_geography_id=frame.id,
        route="upload",
        status="completed" if accepted else "failed",
        file_name=file_name,
        file_sha256=hashlib.sha256(text.encode("utf-8")).hexdigest(),
        rows_accepted=len(accepted),
        rows_rejected=len(rejections),
        rejections=[item.model_dump() for item in rejections],
        requested_by=user_id,
    )
    session.add(ingestion)
    session.flush()
    for indicator, unit, value, row in accepted:
        _upsert_value(
            session,
            indicator_id=indicator.id,
            admin_unit_id=unit.id,
            vintage=row["vintage"].strip(),
            value=value,
            method="observed",
            quality_flags={},
            source_name=(row.get("source_name") or "").strip() or None,
            source_url=(row.get("source_url") or "").strip() or None,
            notes=(row.get("notes") or "").strip() or None,
            ingestion_id=ingestion.id,
            climate_run_id=None,
        )
    session.commit()
    return IngestionResult(
        ingestion_id=ingestion.id,
        status=ingestion.status,
        rows_accepted=ingestion.rows_accepted,
        rows_rejected=ingestion.rows_rejected,
        rejections=rejections,
    )


# --- runs ------------------------------------------------------------------


def run_assessment(
    session: Session, geography_id: str, user_id: str | None
) -> AssessmentResponse:
    """Refresh computed hazard, score the frame's areas and store the run."""

    frame, area_rows = frame_areas(session, geography_id)
    catalogue = _catalogue(session)
    unit_ids = [unit.id for unit, _ in area_rows]
    refresh_computed_hazard(session, unit_ids)

    included = [row for row in catalogue if row.status == "included"]
    latest = _latest_values(session, unit_ids)
    codes = {unit.id: unit.code for unit, _ in area_rows}
    values: dict[str, dict[int, float]] = {}
    inputs: dict[str, dict[str, list]] = {}
    for row in included:
        for unit_id in unit_ids:
            stored = latest.get((row.id, unit_id))
            if stored is not None:
                values.setdefault(row.code, {})[unit_id] = stored.value
                inputs.setdefault(row.code, {})[codes[unit_id]] = [
                    stored.vintage,
                    stored.value,
                ]
    result = scoring.score(
        [
            scoring.Indicator(row.code, row.component, row.direction_to_risk)
            for row in included
        ],
        unit_ids,
        values,
    )

    input_hash = scoring.digest(
        {
            "method_version": scoring.METHOD_VERSION,
            "params": scoring.PARAMS,
            "indicators": [
                [row.code, row.component, row.direction_to_risk] for row in included
            ],
            "values": inputs,
        }
    )
    output_hash = scoring.digest(
        {
            codes[unit_id]: {
                "components": area.components,
                "vulnerability": area.vulnerability,
                "risk": area.risk,
                "class": area.risk_class,
                "rank": area.rank,
                "drivers": area.drivers,
                "scores": {
                    code: item.normalised for code, item in area.indicators.items()
                },
            }
            for unit_id, area in result.areas.items()
        }
    )
    catalogue_version = catalogue[0].catalogue_version if catalogue else ""
    run = VraRun(
        frame_geography_id=frame.id,
        method_version=scoring.METHOD_VERSION,
        catalogue_version=catalogue_version,
        params={
            **scoring.PARAMS,
            "bounds": result.bounds,
            "class_breaks": result.class_breaks,
            "scored_indicators": result.scored_indicators,
            "area_count": len(unit_ids),
        },
        input_hash=input_hash,
        output_hash=output_hash,
        created_by=user_id,
    )
    session.add(run)
    session.flush()
    by_code = {row.code: row for row in included}
    for unit_id, area in result.areas.items():
        session.add(
            VraResult(
                run_id=run.id,
                admin_unit_id=unit_id,
                vulnerability=area.vulnerability,
                risk=area.risk,
                risk_class=area.risk_class,
                rank=area.rank,
                missing_reason=area.missing_reason,
                coverage=area.coverage,
                drivers=area.drivers,
                **area.components,
            )
        )
        for code, item in area.indicators.items():
            stored = latest.get((by_code[code].id, unit_id))
            session.add(
                VraResultIndicator(
                    run_id=run.id,
                    admin_unit_id=unit_id,
                    indicator_id=by_code[code].id,
                    value_id=None if stored is None else stored.id,
                    vintage=None if stored is None else stored.vintage,
                    raw=item.raw,
                    normalised=item.normalised,
                    weight=item.weight,
                    contribution=item.contribution,
                    excluded_reason=item.excluded_reason,
                )
            )
    session.commit()
    return load_assessment(session, geography_id)


# --- reads -----------------------------------------------------------------


def _latest_run(session: Session, frame_id: str) -> VraRun | None:
    return session.scalar(
        select(VraRun)
        .where(VraRun.frame_geography_id == frame_id)
        .order_by(VraRun.id.desc())
        .limit(1)
    )


def _area_item(
    unit: AdminUnit,
    geography: AppGeography,
    stored: VraResult | None,
    catalogue: dict[str, VraIndicator],
    scores: dict[str, float | None],
) -> AreaAssessment:
    if stored is None:
        return AreaAssessment(
            geography_id=geography.id,
            admin_unit_id=unit.id,
            code=unit.code,
            name=unit.name,
            missing_reason="not_assessed",
        )
    return AreaAssessment(
        geography_id=geography.id,
        admin_unit_id=unit.id,
        code=unit.code,
        name=unit.name,
        risk=stored.risk,
        risk_class=stored.risk_class,
        rank=stored.rank,
        components=Components(
            hazard=stored.hazard,
            exposure=stored.exposure,
            sensitivity=stored.sensitivity,
            adaptive_capacity=stored.adaptive_capacity,
            vulnerability=stored.vulnerability,
        ),
        coverage=Coverage(**stored.coverage),
        drivers=[
            Driver(
                code=code,
                name=catalogue[code].name,
                component=catalogue[code].component,
                normalised=scores.get(code) or 0.0,
            )
            for code in stored.drivers
            if code in catalogue
        ],
        missing_reason=stored.missing_reason,
    )


def _driver_scores(
    session: Session, run_id: int
) -> dict[tuple[int, str], float | None]:
    rows = session.execute(
        select(
            VraResultIndicator.admin_unit_id,
            VraIndicator.code,
            VraResultIndicator.normalised,
        )
        .join(VraIndicator, VraIndicator.id == VraResultIndicator.indicator_id)
        .where(
            VraResultIndicator.run_id == run_id,
            VraResultIndicator.normalised >= scoring.DRIVER_THRESHOLD,
        )
    ).all()
    return {(unit_id, code): value for unit_id, code, value in rows}


def load_assessment(session: Session, geography_id: str) -> AssessmentResponse:
    frame, area_rows = frame_areas(session, geography_id)
    run = _latest_run(session, frame.id)
    catalogue = {row.code: row for row in _catalogue(session)}
    stored: dict[int, VraResult] = {}
    driver_scores: dict[tuple[int, str], float | None] = {}
    if run is not None:
        stored = {
            row.admin_unit_id: row
            for row in session.scalars(
                select(VraResult).where(VraResult.run_id == run.id)
            )
        }
        driver_scores = _driver_scores(session, run.id)
    areas = [
        _area_item(
            unit,
            geography,
            stored.get(unit.id),
            catalogue,
            {code: v for (uid, code), v in driver_scores.items() if uid == unit.id},
        )
        for unit, geography in area_rows
    ]
    areas.sort(key=lambda a: (a.rank is None, a.rank or 0, a.name))
    return AssessmentResponse(
        geography_id=frame.id,
        name=frame.name,
        area_level_label=area_rows[0][1].level_label if area_rows else None,
        run=(
            None
            if run is None
            else RunSummary(
                id=run.id,
                created_at=run.created_at,
                method_version=run.method_version,
                weights=run.params.get("weights", "equal"),
                area_count=len(stored),
                indicator_count=len(run.params.get("scored_indicators", [])),
                class_breaks=run.params.get("class_breaks", []),
                input_hash=run.input_hash,
                output_hash=run.output_hash,
            )
        ),
        areas=areas,
    )


def load_area(
    session: Session, geography_id: str, area_geography_id: str
) -> AreaDetailResponse:
    frame, area_rows = frame_areas(session, geography_id)
    match = next(
        ((unit, geo) for unit, geo in area_rows if geo.id == area_geography_id), None
    )
    if match is None:
        raise VraError("VRA_AREA_NOT_FOUND", 404)
    unit, geography = match
    catalogue = _catalogue(session)
    by_code = {row.code: row for row in catalogue}
    run = _latest_run(session, frame.id)
    stored = (
        None
        if run is None
        else session.scalar(
            select(VraResult).where(
                VraResult.run_id == run.id, VraResult.admin_unit_id == unit.id
            )
        )
    )
    scored: dict[int, VraResultIndicator] = {}
    if run is not None:
        scored = {
            row.indicator_id: row
            for row in session.scalars(
                select(VraResultIndicator).where(
                    VraResultIndicator.run_id == run.id,
                    VraResultIndicator.admin_unit_id == unit.id,
                )
            )
        }
    value_ids = [row.value_id for row in scored.values() if row.value_id is not None]
    values = {
        row.id: row
        for row in session.scalars(
            select(VraIndicatorValue).where(VraIndicatorValue.id.in_(value_ids))
        )
    }
    latest = _latest_values(session, [unit.id]) if run is None else {}

    indicators: list[AreaIndicator] = []
    for row in catalogue:
        if row.status != "included":
            continue
        result = scored.get(row.id)
        value = (
            values.get(result.value_id)
            if result is not None and result.value_id is not None
            else latest.get((row.id, unit.id))
        )
        indicators.append(
            AreaIndicator(
                code=row.code,
                name=row.name,
                component=row.component,
                unit=row.unit,
                direction_to_risk=row.direction_to_risk,
                raw=(
                    result.raw
                    if result is not None
                    else (None if value is None else value.value)
                ),
                vintage=(
                    result.vintage
                    if result is not None
                    else (None if value is None else value.vintage)
                ),
                normalised=None if result is None else result.normalised,
                weight=None if result is None else result.weight,
                contribution=None if result is None else result.contribution,
                method=None if value is None else value.method,
                source_name=None if value is None else value.source_name,
                source_url=None if value is None else value.source_url,
                quality_flags={} if value is None else dict(value.quality_flags or {}),
                excluded_reason=None if result is None else result.excluded_reason,
            )
        )
    scores = {
        row.code: scored[row.id].normalised for row in catalogue if row.id in scored
    }
    return AreaDetailResponse(
        area=_area_item(unit, geography, stored, by_code, scores),
        indicators=indicators,
    )


def load_map(session: Session, geography_id: str) -> MapResponse:
    """The risk map's shapes, shaded by VRA risk from the frame's latest run."""

    frame = resolve_map_frame(session, geography_id)
    shapes = load_map_view(session, geography_id, with_values=False)
    run = _latest_run(session, frame.id)
    stored = (
        {}
        if run is None
        else {
            row.admin_unit_id: row
            for row in session.scalars(
                select(VraResult).where(VraResult.run_id == run.id)
            )
        }
    )
    for area in shapes.areas:
        result = stored.get(area.admin_unit_id)
        if result is None:
            area.missing_reason = "not_assessed"
        elif result.risk is None:
            area.missing_reason = result.missing_reason or "insufficient_data"
        else:
            area.value_percent = result.risk * 100
    return shapes.model_copy(
        update={"outcome": "vra", "metric": "vra_risk", "unit": "score"}
    )


def load_coverage(session: Session, geography_id: str) -> CoverageResponse:
    frame, area_rows = frame_areas(session, geography_id)
    unit_ids = [unit.id for unit, _ in area_rows]
    rows = session.scalars(
        select(VraIndicatorValue).where(VraIndicatorValue.admin_unit_id.in_(unit_ids))
    )
    present: dict[int, set[int]] = {}
    vintages: dict[int, set[str]] = {}
    updated: dict[int, datetime] = {}
    for row in rows:
        present.setdefault(row.indicator_id, set()).add(row.admin_unit_id)
        vintages.setdefault(row.indicator_id, set()).add(row.vintage)
        if (
            row.indicator_id not in updated
            or row.updated_at > updated[row.indicator_id]
        ):
            updated[row.indicator_id] = row.updated_at
    ingestions = session.scalars(
        select(VraIngestion)
        .where(VraIngestion.frame_geography_id == frame.id)
        .order_by(VraIngestion.id.desc())
        .limit(50)
    )
    return CoverageResponse(
        area_count=len(unit_ids),
        indicators=[
            CoverageIndicator(
                code=row.code,
                name=row.name,
                component=row.component,
                route=row.route,
                status=row.status,
                present=len(present.get(row.id, ())),
                vintages=sorted(vintages.get(row.id, ())),
                updated_at=updated.get(row.id),
            )
            for row in _catalogue(session)
        ],
        ingestions=[
            IngestionItem(
                id=row.id,
                status=row.status,
                file_name=row.file_name,
                rows_accepted=row.rows_accepted,
                rows_rejected=row.rows_rejected,
                rejections=[Rejection(**item) for item in row.rejections],
                created_at=row.created_at,
                requested_by=row.requested_by,
            )
            for row in ingestions
        ],
    )
