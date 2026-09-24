"""Load precomputed ``health_impact`` rows shaped for the dashboard.

Callers pass a geography identifier and an ``admin_unit_code``; the
service resolves the admin_unit, filters rows for the panel-relevant
scenarios, and returns the response payload shape. No math happens here
- attributable fractions and case counts were computed by
:mod:`chart.health_impact.materialize` at the time the prediction
completed.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

import json

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from chart.climate.scenarios import DASHBOARD_LONG_TERM_RCPS
from chart.shared.outcomes import DEFAULT_OUTCOME
from chart.shared.db.climate_load import ERA5_DATA_SOURCE_NAME
from chart.shared.db.models import (
    ActiveModelAssignment,
    AdminUnit,
    AppGeography,
    ClimateRun,
    DataLabel,
    DataSource,
    DistrictClimate,
    ErfParameters,
    HealthImpact,
    ModelRelease,
    PredictionRequestRecord,
    PredictionResult,
)

from .monthly_predictions import (
    MONTHLY_HORIZON,
    MONTHLY_PREGNANCY_WINDOWS,
    OBSERVED_SCENARIO,
    _first_of_month,
    load_monthly_predictions,
)
from .precision import precision_for_ci
from .schemas import (
    AreaBoundingBox,
    MapArea,
    MapResponse,
    CurrentObservationResponse,
    HealthImpactPoint,
    HorizonCard,
    LongTermRiskResponse,
    LongTermScenario,
    LongTermTableRow,
    ShortTermRiskResponse,
    MonthlyHealthImpactPoint,
    MonthlyRiskResponse,
    MonthlyRiskValues,
    MonthlyTemperature,
)


CURRENT_OBSERVATION_VARIABLE = "tmax_monthly_mean_c"
"""The variable the dashboard's Today strip renders when it is present.

Falls back to whichever observed variable is most recent for the
admin_unit if this exact variable has not been ingested yet.
"""


SHORT_TERM_SCENARIOS: tuple[str, ...] = ("seas5_ensemble", "rcp45")
SHORT_TERM_CARD_HORIZONS: tuple[str, ...] = ("m3", "m6")
LONG_TERM_TABLE_HORIZONS: tuple[str, ...] = ("y5", "y15", "y25")
SOCIOECONOMIC_BASELINE = "ssp2"


def load_monthly_view(
    session: Session,
    app_geography_id: str,
    month: str | None = None,
    *,
    user_id: str | None = None,
    outcome: str = DEFAULT_OUTCOME,
) -> MonthlyRiskResponse:
    """Read ERA5 mean daily maxima and health impacts at their actual month.

    Each scenario/horizon stays separate. This does not infer missing model
    results from temperatures or relabel forecast AF as observed AF.
    """
    try:
        admin_unit = _resolve_admin_unit(session, app_geography_id, None)
    except NoAdminUnitForGeography:
        return MonthlyRiskResponse(admin_unit_id=0, admin_unit_code="")

    temperatures = (
        select(DistrictClimate, ClimateRun)
        .join(ClimateRun, ClimateRun.id == DistrictClimate.climate_run_id)
        .join(DataSource, DataSource.id == ClimateRun.data_source_id)
        .where(
            DistrictClimate.admin_unit_id == admin_unit.id,
            DistrictClimate.variable == "tmax_monthly_mean_c",
            DistrictClimate.unit == "degC",
            ClimateRun.tier == "observed",
            DataSource.name == ERA5_DATA_SOURCE_NAME,
        )
        .order_by(
            DistrictClimate.period_month,
            ClimateRun.generated_at.desc().nulls_last(),
            ClimateRun.id.desc(),
        )
    )
    impacts = (
        select(HealthImpact)
        .join(ErfParameters, ErfParameters.id == HealthImpact.erf_parameters_id)
        .where(
            HealthImpact.admin_unit_id == admin_unit.id,
            ErfParameters.outcome == outcome,
        )
        .order_by(HealthImpact.valid_month, HealthImpact.scenario, HealthImpact.horizon)
    )
    if month is not None:
        period = date.fromisoformat(f"{month}-01")
        temperatures = temperatures.where(DistrictClimate.period_month == period)
        impacts = impacts.where(HealthImpact.valid_month == period)

    months: dict[str, MonthlyRiskValues] = {}
    for row, run in session.execute(temperatures):
        entry = months.setdefault(
            row.period_month.strftime("%Y-%m"), MonthlyRiskValues()
        )
        if entry.temperature is None:
            entry.temperature = MonthlyTemperature(
                tmax_monthly_mean_c=row.value,
                unit=row.unit,
                source_name=run.source_name,
                climate_run_id=run.id,
                data_label=run.data_label.value,
            )
    for impact in session.scalars(impacts):
        entry = months.setdefault(
            impact.valid_month.strftime("%Y-%m"), MonthlyRiskValues()
        )
        entry.health_impacts.append(
            MonthlyHealthImpactPoint(
                **_to_point(impact).model_dump(),
                horizon=impact.horizon,
                climate_run_id=impact.climate_run_id,
            )
        )
    # No longer gated on a caller: stored predictions are shared, so a month
    # one planner computed shows for every authorised reader of the place
    # rather than being recomputed per person.
    for key, prediction in load_monthly_predictions(
        session, admin_unit.id, user_id, month, outcome
    ).items():
        months.setdefault(key, MonthlyRiskValues()).prediction = prediction
    # Only present once boundaries have been ingested for this place; a unit
    # registered without a boundary artifact carries no box, and the dashboard
    # simply omits the row rather than inventing coordinates.
    north, west = admin_unit.bbox_north, admin_unit.bbox_west
    south, east = admin_unit.bbox_south, admin_unit.bbox_east
    bbox = (
        AreaBoundingBox(north=north, west=west, south=south, east=east)
        if north is not None
        and west is not None
        and south is not None
        and east is not None
        else None
    )
    return MonthlyRiskResponse(
        admin_unit_id=admin_unit.id,
        admin_unit_code=admin_unit.code,
        area_bbox=bbox,
        months=dict(sorted(months.items())),
    )


_RCP_LABELS: dict[str, str] = {
    "rcp26": "Very low emissions (RCP 2.6)",
    "rcp45": "Low emissions (RCP 4.5)",
    "rcp60": "High emissions (RCP 6.0)",
    "rcp85": "Very high emissions (RCP 8.5)",
}


class NoAdminUnitForGeography(LookupError):
    """The requested admin_unit_code does not exist under this geography."""


@dataclass(frozen=True)
class _Filters:
    admin_unit_id: int
    scenarios: tuple[str, ...]


def _resolve_admin_unit(
    session: Session,
    app_geography_id: str,
    admin_unit_selector: str | None,
) -> AdminUnit:
    """Look up the admin_unit for a URL geography id + optional selector.

    The dashboard sends ``AppGeography.id`` values everywhere - the state
    id as the URL path segment, and (when a division is picked in the
    "Viewing for" dropdown) the division's own AppGeography.id as the
    ``admin_unit`` query param. So the selector is resolved as an
    ``AppGeography.id`` when present, and the path's state id is used
    otherwise. Falling back to ``AdminUnit.code`` keeps the legacy CLI
    consumers working when they pass the raw place_code.
    """

    target = admin_unit_selector or app_geography_id
    admin_unit = session.scalar(
        select(AdminUnit).where(AdminUnit.app_geography_id == target)
    )
    if admin_unit is None and admin_unit_selector is not None:
        # Legacy fallback: caller passed a place_code rather than an
        # AppGeography.id. Match on AdminUnit.code within the state scope.
        admin_unit = session.scalar(
            select(AdminUnit).where(
                AdminUnit.app_geography_id == app_geography_id,
                AdminUnit.code == admin_unit_selector,
            )
        )
    if admin_unit is None:
        raise NoAdminUnitForGeography(
            f"{app_geography_id}"
            + (f"/{admin_unit_selector}" if admin_unit_selector else "")
        )
    return admin_unit


def _fetch_rows(session: Session, filters: _Filters) -> list[HealthImpact]:
    return list(
        session.scalars(
            select(HealthImpact)
            .where(
                HealthImpact.admin_unit_id == filters.admin_unit_id,
                HealthImpact.scenario.in_(filters.scenarios),
            )
            .order_by(HealthImpact.scenario, HealthImpact.valid_month)
        )
    )


def _to_point(row: HealthImpact) -> HealthImpactPoint:
    return HealthImpactPoint(
        valid_month=row.valid_month,
        relative_risk_milli=row.relative_risk_milli,
        rr_ci_low_milli=row.rr_ci_low_milli,
        rr_ci_high_milli=row.rr_ci_high_milli,
        attributable_fraction_milli=row.attributable_fraction_milli,
        attributable_number=row.attributable_number,
        ensemble_spread_milli=row.ensemble_spread_milli,
        scenario=row.scenario,
        data_label=row.data_label.value,
    )


def _cards_from_rows(rows: list[HealthImpact]) -> list[HorizonCard]:
    by_horizon: dict[str, HealthImpact] = {}
    for row in rows:
        by_horizon.setdefault(row.horizon, row)
    cards: list[HorizonCard] = []
    for horizon in SHORT_TERM_CARD_HORIZONS:
        entry = by_horizon.get(horizon)
        if entry is None:
            continue
        cards.append(
            HorizonCard(
                horizon=horizon,
                valid_month=entry.valid_month,
                attributable_fraction_milli=entry.attributable_fraction_milli,
                attributable_number=entry.attributable_number,
                rr_ci_low_milli=entry.rr_ci_low_milli,
                rr_ci_high_milli=entry.rr_ci_high_milli,
                precision=precision_for_ci(
                    entry.rr_ci_low_milli, entry.rr_ci_high_milli
                ),
            )
        )
    return cards


def load_short_term_view(
    session: Session,
    app_geography_id: str,
    admin_unit_code: str | None = None,
) -> ShortTermRiskResponse:
    try:
        admin_unit = _resolve_admin_unit(session, app_geography_id, admin_unit_code)
    except NoAdminUnitForGeography:
        if admin_unit_code is not None:
            raise
        return ShortTermRiskResponse(
            admin_unit_id=0,
            admin_unit_code="",
            series=[],
            cards=[],
        )
    rows = _fetch_rows(
        session,
        _Filters(admin_unit_id=admin_unit.id, scenarios=SHORT_TERM_SCENARIOS),
    )
    series = [_to_point(row) for row in rows]
    cards = _cards_from_rows(rows)
    return ShortTermRiskResponse(
        admin_unit_id=admin_unit.id,
        admin_unit_code=admin_unit.code,
        series=series,
        cards=cards,
    )


def load_long_term_view(
    session: Session,
    app_geography_id: str,
    admin_unit_code: str | None = None,
) -> LongTermRiskResponse:
    try:
        admin_unit = _resolve_admin_unit(session, app_geography_id, admin_unit_code)
    except NoAdminUnitForGeography:
        if admin_unit_code is not None:
            raise
        return LongTermRiskResponse(
            admin_unit_id=0,
            admin_unit_code="",
            scenarios=[
                LongTermScenario(
                    name=name,
                    label=_RCP_LABELS.get(name, name),
                    series=[],
                    table=[],
                )
                for name in DASHBOARD_LONG_TERM_RCPS
            ],
            socioeconomic_baseline=SOCIOECONOMIC_BASELINE,
        )
    rows = _fetch_rows(
        session,
        _Filters(admin_unit_id=admin_unit.id, scenarios=DASHBOARD_LONG_TERM_RCPS),
    )
    by_scenario: dict[str, list[HealthImpact]] = {
        name: [] for name in DASHBOARD_LONG_TERM_RCPS
    }
    for row in rows:
        by_scenario.setdefault(row.scenario, []).append(row)

    scenarios = [
        _build_long_term_scenario(name, by_scenario.get(name, []))
        for name in DASHBOARD_LONG_TERM_RCPS
    ]
    return LongTermRiskResponse(
        admin_unit_id=admin_unit.id,
        admin_unit_code=admin_unit.code,
        scenarios=scenarios,
        socioeconomic_baseline=SOCIOECONOMIC_BASELINE,
    )


def load_current_observation(
    session: Session,
    app_geography_id: str,
    admin_unit_code: str | None = None,
) -> CurrentObservationResponse:
    """Read the most recent observed climate value for one place.

    Prefers the canonical dashboard variable (``tmax_monthly_mean_c``)
    but falls back to the newest observed row of any variable so the
    strip renders as soon as any reanalysis data has landed.
    """

    try:
        admin_unit = _resolve_admin_unit(session, app_geography_id, admin_unit_code)
    except NoAdminUnitForGeography:
        if admin_unit_code is not None:
            raise
        return _empty_current_observation()

    row = _select_latest_observed(session, admin_unit.id, CURRENT_OBSERVATION_VARIABLE)
    if row is None:
        row = _select_latest_observed(session, admin_unit.id, variable=None)

    if row is None:
        return CurrentObservationResponse(
            admin_unit_id=admin_unit.id,
            admin_unit_code=admin_unit.code,
            period_month=None,
            variable=None,
            value=None,
            unit=None,
            source_name=None,
            updated_at=None,
        )

    district_row, source_name = row
    return CurrentObservationResponse(
        admin_unit_id=admin_unit.id,
        admin_unit_code=admin_unit.code,
        period_month=district_row.period_month,
        variable=district_row.variable,
        value=district_row.value,
        unit=district_row.unit,
        source_name=source_name,
        updated_at=district_row.period_month,
    )


def _select_latest_observed(
    session: Session,
    admin_unit_id: int,
    variable: str | None,
) -> tuple[DistrictClimate, str | None] | None:
    query = (
        select(DistrictClimate, ClimateRun.source_name)
        .join(ClimateRun, ClimateRun.id == DistrictClimate.climate_run_id)
        .where(
            DistrictClimate.admin_unit_id == admin_unit_id,
            ClimateRun.tier == "observed",
        )
        .order_by(DistrictClimate.period_month.desc(), DistrictClimate.id.desc())
        .limit(1)
    )
    if variable is not None:
        query = query.where(DistrictClimate.variable == variable)
    result = session.execute(query).first()
    return None if result is None else (result[0], result[1])


def _empty_current_observation() -> CurrentObservationResponse:
    return CurrentObservationResponse(
        admin_unit_id=0,
        admin_unit_code="",
        period_month=None,
        variable=None,
        value=None,
        unit=None,
        source_name=None,
        updated_at=None,
    )


def _build_long_term_scenario(name: str, rows: list[HealthImpact]) -> LongTermScenario:
    by_horizon: dict[str, HealthImpact] = {}
    for row in rows:
        by_horizon.setdefault(row.horizon, row)
    table = [
        LongTermTableRow(
            horizon=horizon,
            valid_month=entry.valid_month,
            attributable_fraction_milli=entry.attributable_fraction_milli,
            attributable_number=entry.attributable_number,
        )
        for horizon in LONG_TERM_TABLE_HORIZONS
        if (entry := by_horizon.get(horizon)) is not None
    ]
    return LongTermScenario(
        name=name,
        label=_RCP_LABELS.get(name, name),
        series=[_to_point(row) for row in rows],
        table=table,
    )


#: Display simplification for map geometry. At this tolerance Madhya Pradesh's
#: divisions drop from 4 MB of GeoJSON to 63 kB while the outlines stay
#: recognisable. Applied to the response only - every climate extraction and
#: every area calculation continues to use the unsimplified boundary.
MAP_SIMPLIFY_TOLERANCE_DEGREES = 0.01


def _has_children(session: Session, geography_id: str) -> bool:
    """Whether anything sits beneath this geography in the place tree."""
    return (
        session.scalar(
            select(func.count())
            .select_from(AppGeography)
            .where(AppGeography.parent_id == geography_id)
        )
        or 0
    ) > 0


def load_map_view(
    session: Session,
    geography_id: str,
    month: str | None = None,
    *,
    outcome: str = DEFAULT_OUTCOME,
) -> MapResponse:
    """Areas beneath a geography, shaded by their attributable fraction.

    Every area under the selected geography is returned, including those with
    no fitted model and those whose month has not been computed. They carry a
    null value and a reason instead of being omitted: a map that silently
    drops uncovered districts tells the reader those places are fine, which is
    the opposite of what an absent model means.
    """

    selected = session.get(AppGeography, geography_id)
    if selected is None:
        raise NoAdminUnitForGeography(geography_id)

    # A selection with nothing beneath it is framed on its siblings rather
    # than on itself. Drilling into one division used to return that division
    # alone: a single polygon floating with nothing to compare it against, and
    # no visible change when moving between divisions, because every one of
    # them drew the same lone shape. Which area is highlighted is the caller's
    # business - the frame it sits in is the parent's children.
    frame = selected
    if selected.parent_id is not None and not _has_children(session, selected.id):
        parent = session.get(AppGeography, selected.parent_id)
        if parent is not None:
            frame = parent

    simplified = func.ST_AsGeoJSON(
        func.ST_SimplifyPreserveTopology(
            AdminUnit.boundary, MAP_SIMPLIFY_TOLERANCE_DEGREES
        )
    )
    rows = session.execute(
        select(
            AdminUnit.id,
            AdminUnit.code,
            AdminUnit.name,
            AdminUnit.level,
            AdminUnit.app_geography_id,
            AdminUnit.bbox_west,
            AdminUnit.bbox_south,
            AdminUnit.bbox_east,
            AdminUnit.bbox_north,
            simplified,
            AppGeography.path,
        )
        .join(AppGeography, AppGeography.id == AdminUnit.app_geography_id)
        .where(
            AppGeography.country_code == frame.country_code,
            or_(
                AppGeography.id == frame.id,
                AppGeography.path.startswith(f"{frame.path}/"),
            ),
        )
        .order_by(AppGeography.sort_order, AdminUnit.name)
    ).all()

    # Keep only the finest level available, dropping any area that contains
    # another area in the same result. A place can carry a boundary of its own
    # *and* own the places beneath it - Madhya Pradesh has a state outline as
    # well as eleven divisions - and returning both drew the state on top of
    # its own divisions. The reader saw one shape with one shade, every
    # division hidden under it, and switching between them changed nothing
    # visible.
    paths = [row[-1] for row in rows]
    rows = [
        row
        for row in rows
        if not any(other.startswith(f"{row[-1]}/") for other in paths)
    ]

    unit_ids = [row[0] for row in rows]
    covered = set(
        session.scalars(
            select(ActiveModelAssignment.admin_unit_id)
            .join(
                ModelRelease,
                ModelRelease.id == ActiveModelAssignment.model_release_id,
            )
            .where(
                ActiveModelAssignment.admin_unit_id.in_(unit_ids),
                ModelRelease.outcome == outcome,
            )
        )
    )

    # Areas with a job already in flight for this month, so the map can
    # distinguish "on its way" from "nobody has asked for this".
    in_flight_query = select(PredictionRequestRecord.admin_unit_id).where(
        PredictionRequestRecord.admin_unit_id.in_(unit_ids),
        PredictionRequestRecord.status.in_(("waiting", "queued", "running")),
    )
    if month is not None:
        in_flight_query = in_flight_query.where(
            PredictionRequestRecord.planning_date == _first_of_month(month)
        )
    in_flight = set(session.scalars(in_flight_query)) if unit_ids else set()

    values: dict[int, PredictionResult] = {}
    if unit_ids:
        # The same six-way grain `load_monthly_predictions` reads on. Without
        # the scenario and pregnancy window, `setdefault` below picked
        # whichever row the database happened to return first - low birth
        # weight stores one per pregnancy window - so the map could shade an
        # area from a different window than the card beside it reported for
        # that same area and month.
        value_query = select(PredictionResult).where(
            PredictionResult.admin_unit_id.in_(unit_ids),
            PredictionResult.outcome == outcome,
            PredictionResult.horizon == MONTHLY_HORIZON,
            PredictionResult.scenario == OBSERVED_SCENARIO,
            PredictionResult.pregnancy_window.in_(MONTHLY_PREGNANCY_WINDOWS),
            PredictionResult.data_label == DataLabel.reanalysis,
        )
        if month is not None:
            value_query = value_query.where(
                PredictionResult.valid_month == _first_of_month(month)
            )
        for row in session.scalars(
            value_query.order_by(
                PredictionResult.valid_month.desc(),
                PredictionResult.computed_at.desc(),
            )
        ):
            values.setdefault(row.admin_unit_id, row)

    areas: list[MapArea] = []
    west = south = east = north = None
    for (
        unit_id,
        code,
        name,
        level,
        app_geography_id,
        bbox_west,
        bbox_south,
        bbox_east,
        bbox_north,
        geometry_json,
        _path,
    ) in rows:
        stored = values.get(unit_id)
        if stored is not None:
            missing_reason = None
        elif unit_id not in covered:
            missing_reason = "no_model"
        elif unit_id in in_flight:
            missing_reason = "running"
        else:
            missing_reason = "no_prediction"
        areas.append(
            MapArea(
                geography_id=app_geography_id,
                admin_unit_id=unit_id,
                code=code,
                name=name,
                level=level,
                value_percent=(
                    None if stored is None else stored.attributable_fraction_milli / 10
                ),
                missing_reason=missing_reason,
                odds_ratio=None if stored is None else stored.odds_ratio,
                on_training_support=(
                    None if stored is None else stored.on_training_support
                ),
                geometry=json.loads(geometry_json) if geometry_json else None,
            )
        )
        if None not in (bbox_west, bbox_south, bbox_east, bbox_north):
            west = bbox_west if west is None else min(west, bbox_west)
            south = bbox_south if south is None else min(south, bbox_south)
            east = bbox_east if east is None else max(east, bbox_east)
            north = bbox_north if north is None else max(north, bbox_north)

    return MapResponse(
        geography_id=geography_id,
        outcome=outcome,
        month=month,
        # Bound to locals mypy can narrow: `None in (...)` guards the tuple
        # without narrowing the names inside it.
        bounds=(
            []
            if west is None or south is None or east is None or north is None
            else [west, south, east, north]
        ),
        simplify_tolerance_degrees=MAP_SIMPLIFY_TOLERANCE_DEGREES,
        areas=areas,
    )
