from __future__ import annotations

from calendar import monthrange
from datetime import date, datetime, timezone
from typing import cast

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from chart.shared.db.models import (
    AdminUnit,
    ClimateInputMonthRecord,
    ClimateInputWindowRecord,
    ClimateRun,
    DataSource,
    DistrictClimate,
    Provenance,
)

from .data_contract import (
    CLIMATE_CONTRACT_VERSION,
    ClimateDataLabel,
    ClimateDataContractError,
    ClimateFreshnessStatus,
    ClimateQualityStatus,
    ClimateSourceClass,
    MonthlyClimateRecord,
    build_climate_input_window,
)
from .source_policy import resolve_month_source, seasonal_issue_covers


class ClimateInputError(ValueError):
    def __init__(self, code: str, detail: str = "") -> None:
        super().__init__(f"{code}: {detail}" if detail else code)
        self.code = code
        self.detail = detail


def target_months(target_end_month: date) -> tuple[date, date, date]:
    newest = target_end_month.replace(day=1)
    middle = _previous_month(newest)
    oldest = _previous_month(middle)
    return newest, middle, oldest


def build_and_persist_input_window(
    session: Session,
    *,
    admin_unit_id: int,
    target_end_month: date,
    live: bool,
    now: datetime | None = None,
    projection_scenario: str | None = None,
    projection_period: str | None = None,
) -> ClimateInputWindowRecord:
    """Select and persist the exact three values that may be sent to a model."""

    current_time = now or datetime.now(timezone.utc)
    admin_unit = session.get(AdminUnit, admin_unit_id)
    if admin_unit is None:
        raise ClimateInputError("CLIMATE_PLACE_NOT_FOUND", str(admin_unit_id))

    selected: list[tuple[MonthlyClimateRecord, DistrictClimate]] = []
    missing: list[str] = []
    for period_month, row in select_input_months(
        session,
        admin_unit_id=admin_unit_id,
        target_end_month=target_end_month,
        now=current_time,
        projection_scenario=projection_scenario,
        projection_period=projection_period,
    ):
        if row is None:
            missing.append(period_month.strftime("%Y-%m"))
            continue
        selected.append((_to_contract_record(admin_unit, *row, current_time), row[0]))

    if missing:
        raise ClimateInputError("CLIMATE_DATA_NOT_READY", ", ".join(missing))

    try:
        contract = build_climate_input_window(
            [record for record, _ in selected],
            live=live,
            now=current_time,
        )
    except ClimateDataContractError as error:
        raise ClimateInputError(error.code, error.detail) from error
    existing = session.scalar(
        select(ClimateInputWindowRecord).where(
            ClimateInputWindowRecord.input_hash == contract.input_hash
        )
    )
    if existing is not None:
        return existing

    try:
        with session.begin_nested():
            stored = ClimateInputWindowRecord(
                admin_unit_id=admin_unit_id,
                target_end_month=target_end_month.replace(day=1),
                input_hash=contract.input_hash,
                contract_version=CLIMATE_CONTRACT_VERSION,
            )
            session.add(stored)
            session.flush()
            for lag_index, (_, climate_value) in enumerate(selected):
                session.add(
                    ClimateInputMonthRecord(
                        climate_input_window_id=stored.id,
                        district_climate_id=climate_value.id,
                        lag_index=lag_index,
                    )
                )
            session.flush()
        return stored
    except IntegrityError:
        # Another worker persisted the same immutable input while this transaction
        # was selecting it. The savepoint keeps the caller's transaction usable.
        existing = session.scalar(
            select(ClimateInputWindowRecord).where(
                ClimateInputWindowRecord.input_hash == contract.input_hash
            )
        )
        if existing is not None:
            return existing
        raise


def select_input_months(
    session: Session,
    *,
    admin_unit_id: int,
    target_end_month: date,
    now: datetime | None = None,
    projection_scenario: str | None = None,
    projection_period: str | None = None,
) -> list[
    tuple[
        date,
        tuple[DistrictClimate, ClimateRun, DataSource, Provenance] | None,
    ]
]:
    current_time = now or datetime.now(timezone.utc)
    admin_unit = session.get(AdminUnit, admin_unit_id)
    expected_boundary_version = admin_unit.boundary_version if admin_unit else None
    return [
        (
            period_month,
            _select_month(
                session,
                admin_unit_id=admin_unit_id,
                period_month=period_month,
                current_time=current_time,
                expected_boundary_version=expected_boundary_version,
                projection_scenario=projection_scenario,
                projection_period=projection_period,
            ),
        )
        for period_month in target_months(target_end_month)
    ]


def read_input_values(
    session: Session, window_id: int
) -> list[tuple[DistrictClimate, ClimateRun, DataSource, Provenance]]:
    result = session.execute(
        select(DistrictClimate, ClimateRun, DataSource, Provenance)
        .join(
            ClimateInputMonthRecord,
            ClimateInputMonthRecord.district_climate_id == DistrictClimate.id,
        )
        .join(ClimateRun, ClimateRun.id == DistrictClimate.climate_run_id)
        .join(DataSource, DataSource.id == ClimateRun.data_source_id)
        .join(Provenance, Provenance.id == ClimateRun.provenance_id)
        .where(ClimateInputMonthRecord.climate_input_window_id == window_id)
        .order_by(ClimateInputMonthRecord.lag_index.asc())
    )
    return list(result.tuples().all())


def _select_month(
    session: Session,
    *,
    admin_unit_id: int,
    period_month: date,
    current_time: datetime,
    expected_boundary_version: str | None,
    projection_scenario: str | None,
    projection_period: str | None,
) -> tuple[DistrictClimate, ClimateRun, DataSource, Provenance] | None:
    decision = resolve_month_source(
        period_month,
        now=current_time,
        projection_scenario=projection_scenario,
        projection_period=projection_period,
    )
    if decision.source_class is None:
        return None

    filters = [
        DistrictClimate.admin_unit_id == admin_unit_id,
        DistrictClimate.period_month == period_month,
        DistrictClimate.variable == "tmax_monthly_mean_c",
        func.coalesce(ClimateRun.source_class, ClimateRun.tier)
        == decision.source_class,
    ]
    if expected_boundary_version and expected_boundary_version != "unknown":
        filters.append(ClimateRun.boundary_version == expected_boundary_version)
    if decision.source_class == "seasonal":
        filters.extend(
            [
                ClimateRun.issue_time.is_not(None),
                ClimateRun.issue_time <= current_time,
            ]
        )
    if decision.source_class == "projection" and projection_period is not None:
        filters.extend(
            [
                ClimateRun.scenario == projection_scenario,
                ClimateRun.window_start_year == int(projection_period[:4]),
                ClimateRun.window_end_year == int(projection_period[-4:]),
            ]
        )

    rows = (
        session.execute(
            select(DistrictClimate, ClimateRun, DataSource, Provenance)
            .join(ClimateRun, ClimateRun.id == DistrictClimate.climate_run_id)
            .join(DataSource, DataSource.id == ClimateRun.data_source_id)
            .join(Provenance, Provenance.id == ClimateRun.provenance_id)
            .where(*filters)
        )
        .tuples()
        .all()
    )
    if not rows:
        return None

    rows = [
        row
        for row in rows
        if (row[1].source_class or row[1].tier) == decision.source_class
        and (
            decision.source_class != "seasonal"
            or (
                seasonal_issue_covers(row[1].issue_time, period_month)
                and row[1].issue_time is not None
                and _aware(row[1].issue_time) <= _aware(current_time)
            )
        )
        and (
            decision.source_class != "projection"
            or (
                row[1].scenario == projection_scenario
                and projection_period is not None
                and row[1].window_start_year == int(projection_period[:4])
                and row[1].window_end_year == int(projection_period[-4:])
            )
        )
        and _has_complete_reanalysis_days(row[0], row[1])
    ]
    if not rows:
        return None

    def sort_key(row) -> tuple:
        _, run, _, _ = row
        epoch = datetime(1970, 1, 1, tzinfo=timezone.utc)
        issued = _aware(run.issue_time or run.generated_at or epoch)
        generated = _aware(run.generated_at or epoch)
        is_sample = run.data_label.value == "sample" or run.quality_status == "sample"
        is_stale = bool(
            run.fresh_until and _aware(run.fresh_until) < _aware(current_time)
        )
        return (
            is_sample,
            is_stale,
            -issued.timestamp(),
            -generated.timestamp(),
        )

    return min(rows, key=sort_key)


def _to_contract_record(
    admin_unit: AdminUnit,
    climate_value: DistrictClimate,
    run: ClimateRun,
    source: DataSource,
    provenance: Provenance,
    now: datetime,
) -> MonthlyClimateRecord:
    period = climate_value.period_month
    source_class = run.source_class or (
        "observed" if run.tier == "observed" else run.tier
    )
    is_projection = source_class == "projection"
    fresh_until = (
        None
        if is_projection
        else (
            _aware(run.fresh_until)
            if run.fresh_until
            else datetime(1970, 1, 1, tzinfo=timezone.utc)
        )
    )
    freshness = (
        "not_applicable"
        if is_projection
        else ("current" if fresh_until and fresh_until >= _aware(now) else "stale")
    )
    label = run.data_label.value
    return MonthlyClimateRecord(
        period_month=period,
        value=float(climate_value.value),
        admin_unit_code=admin_unit.code,
        admin_unit_level=admin_unit.level,
        boundary_version=run.boundary_version
        or admin_unit.boundary_version
        or "unknown",
        aggregation_method=run.aggregation_version or climate_value.agg_method,
        source_class=cast(ClimateSourceClass, source_class),
        source_name=run.source_name or source.name,
        source_version=run.source_version or source.version or run.input_hash,
        source_uri=run.source_uri or run.raw_object_uri or provenance.source_uri,
        source_license=(
            run.source_license or source.license or provenance.license or "unknown"
        ),
        source_calendar="gregorian",
        data_label=cast(ClimateDataLabel, label),
        quality_status=cast(
            ClimateQualityStatus,
            climate_value.quality_status or run.quality_status or "validated",
        ),
        freshness_status=cast(ClimateFreshnessStatus, freshness),
        generated_at=_aware(run.generated_at or provenance.created_at),
        valid_from=run.valid_from or period,
        valid_to=run.valid_to
        or date(period.year, period.month, monthrange(period.year, period.month)[1]),
        issue_time=_aware(run.issue_time) if run.issue_time else None,
        ensemble_member=run.ensemble_summary,
        scenario=run.scenario,
        bias_adjustment=run.bias_adjustment,
        downscaling_method=run.downscaling_method,
        fresh_until=fresh_until,
    )


def _has_complete_reanalysis_days(value: DistrictClimate, run: ClimateRun) -> bool:
    """Reject a partial ERA5/reanalysis month per tdd.md §4.

    Sample and forecast/projection rows do not carry per-day counts and pass
    through; observed and reanalysis rows must have observed_days ==
    expected_days when both are populated.
    """

    if run.data_label.value not in {"observed", "reanalysis"}:
        return True
    if value.observed_days is None or value.expected_days is None:
        return False
    return (
        value.expected_days > 0
        and value.observed_days == value.expected_days
    )


def _previous_month(value: date) -> date:
    if value.month == 1:
        return date(value.year - 1, 12, 1)
    return date(value.year, value.month - 1, 1)


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
