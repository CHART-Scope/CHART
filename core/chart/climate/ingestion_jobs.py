"""Operator-triggered climate pulls, and what coverage already exists.

Climate has only ever arrived as a side effect of asking for a prediction, one
Copernicus request per area per month. That is a median 215s queue wait each,
so a country's worth of areas produced more work than the workers could drain
- 95 of 189 requests failed, 92 of them because their lease expired before
anything reached them.

This module is the deliberate version: ask for a whole country, watch it
happen. One download covers every deployed area, so the job is scoped to a
country rather than an area.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from chart.climate.country_pull import configured_areas
from chart.shared.db.models import (
    AdminUnit,
    AppGeography,
    ClimateIngestionJob,
    ClimateRun,
    DataLabel,
    DistrictClimate,
)

#: Statuses that mean work is still expected to produce a result. A country
#: with one of these must not be queued again.
LIVE_STATUSES = ("queued", "running")

#: ERA5 monthly fields appear in the first days of the month after the one
#: they cover. "A few days in arrears" therefore rules out the month in
#: progress *and*, early in a month, the one that has just ended: asking for
#: it in the first week returns nothing and fails the job.
ERA5_PUBLICATION_LAG_DAYS = 6

#: How far back the automatic top-up looks for a missing month.
TOP_UP_MONTHS = 2

#: An automatic pull is not repeated sooner than this after the last one.
TOP_UP_RETRY_AFTER = timedelta(hours=24)

TOP_UP_REQUESTER = "chart-auto-top-up"


class AreaCoverage(BaseModel):
    geography_id: str | None = None
    admin_unit_id: int
    code: str
    name: str
    months: int = 0
    earliest: date | None = None
    latest: date | None = None


class CountryCoverage(BaseModel):
    country_code: str
    name: str
    areas_total: int
    areas_with_data: int
    months: int = 0
    earliest: date | None = None
    latest: date | None = None
    areas: list[AreaCoverage] = Field(default_factory=list)


class IngestionJobView(BaseModel):
    id: int
    country_code: str
    months: list[str] = Field(default_factory=list)
    status: str
    stage: str
    areas_total: int
    areas_done: int
    error_code: str | None = None
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None


def _now() -> datetime:
    return datetime.now(timezone.utc)


def load_coverage(session: Session) -> list[CountryCoverage]:
    """What climate data exists, per country and per area.

    Counts distinct months rather than rows: each month holds several
    variables, so a row count would read as several times more coverage than
    there is.
    """

    rows = session.execute(
        select(
            AppGeography.country_code,
            AdminUnit.id,
            AdminUnit.code,
            AdminUnit.name,
            AdminUnit.app_geography_id,
            func.count(func.distinct(DistrictClimate.period_month)),
            func.min(DistrictClimate.period_month),
            func.max(DistrictClimate.period_month),
        )
        .join(AppGeography, AppGeography.id == AdminUnit.app_geography_id)
        .outerjoin(DistrictClimate, DistrictClimate.admin_unit_id == AdminUnit.id)
        .group_by(
            AppGeography.country_code,
            AdminUnit.id,
            AdminUnit.code,
            AdminUnit.name,
            AdminUnit.app_geography_id,
        )
        .order_by(AppGeography.country_code, AdminUnit.name)
    ).all()

    countries: dict[str, CountryCoverage] = {}
    for code, unit_id, unit_code, name, geography_id, months, earliest, latest in rows:
        country = countries.setdefault(
            code,
            CountryCoverage(
                country_code=code,
                name=_country_name(session, code),
                areas_total=0,
                areas_with_data=0,
            ),
        )
        country.areas_total += 1
        if months:
            country.areas_with_data += 1
        country.areas.append(
            AreaCoverage(
                geography_id=geography_id,
                admin_unit_id=unit_id,
                code=unit_code,
                name=name,
                months=months or 0,
                earliest=earliest,
                latest=latest,
            )
        )

    # The country's month range is the union of its areas', not a sum: eleven
    # areas each holding the same fifteen months is fifteen months of data.
    # The count is asked of the database rather than folded from the per-area
    # counts, because the largest single area's count is not the union: one
    # area holding Jan-Mar and another Apr-Dec is twelve months of coverage,
    # not nine, and reporting nine beside a Jan-Dec range contradicted itself
    # on the settings card.
    month_totals: dict[str, int] = {
        str(code): int(total)
        for code, total in session.execute(
            select(
                AppGeography.country_code,
                func.count(func.distinct(DistrictClimate.period_month)),
            )
            .join(AdminUnit, AdminUnit.app_geography_id == AppGeography.id)
            .join(DistrictClimate, DistrictClimate.admin_unit_id == AdminUnit.id)
            .group_by(AppGeography.country_code)
        ).all()
    }
    for country in countries.values():
        earliest_dates = [area.earliest for area in country.areas if area.earliest]
        latest_dates = [area.latest for area in country.areas if area.latest]
        if earliest_dates and latest_dates:
            country.earliest = min(earliest_dates)
            country.latest = max(latest_dates)
            country.months = month_totals.get(country.country_code, 0)
    return sorted(countries.values(), key=lambda item: item.country_code)


def _country_name(session: Session, country_code: str) -> str:
    root = session.scalar(
        select(AppGeography.name)
        .where(
            AppGeography.country_code == country_code,
            AppGeography.parent_id.is_(None),
        )
        .limit(1)
    )
    return root or country_code


def live_job_for(session: Session, country_code: str) -> ClimateIngestionJob | None:
    """A pull already under way for this country, if there is one."""
    return session.scalar(
        select(ClimateIngestionJob)
        .where(
            ClimateIngestionJob.country_code == country_code,
            ClimateIngestionJob.status.in_(LIVE_STATUSES),
        )
        .order_by(ClimateIngestionJob.id.desc())
    )


def create_job(
    session: Session,
    *,
    country_code: str,
    months: list[date],
    requested_by_user_id: str | None = None,
) -> tuple[ClimateIngestionJob, bool]:
    """Queue a pull, or hand back the one already running.

    Returns ``(job, created)``. Never starts a second pull for a country that
    has one in flight: a country is one download, and two of them would put
    the queue back where it was.
    """
    existing = live_job_for(session, country_code)
    if existing is not None:
        return existing, False

    units = configured_areas(session, country_code)
    job = ClimateIngestionJob(
        country_code=country_code,
        months=[month.strftime("%Y-%m") for month in sorted(months)],
        status="queued",
        stage="queued",
        areas_total=len(units),
        areas_done=0,
        requested_by_user_id=requested_by_user_id,
    )
    session.add(job)
    session.flush()
    return job, True


def claim_job(
    session: Session, job_id: int, *, dagster_run_id: str
) -> ClimateIngestionJob | None:
    """Move a queued job to running. Returns None if it is not ours to take."""
    job = session.get(ClimateIngestionJob, job_id, with_for_update=True)
    if job is None or job.status not in ("queued", "running"):
        return None
    job.status = "running"
    job.stage = "downloading"
    job.dagster_run_id = dagster_run_id
    job.updated_at = _now()
    return job


def record_progress(
    session: Session, job_id: int, *, stage: str, areas_done: int | None = None
) -> None:
    job = session.get(ClimateIngestionJob, job_id)
    if job is None:
        return
    job.stage = stage
    if areas_done is not None:
        job.areas_done = areas_done
    job.updated_at = _now()


def complete_job(
    session: Session, job_id: int, *, climate_run_id: int, areas_done: int
) -> None:
    job = session.get(ClimateIngestionJob, job_id)
    if job is None:
        return
    job.status = "completed"
    job.stage = "completed"
    job.climate_run_id = climate_run_id
    job.areas_done = areas_done
    job.error_code = None
    job.completed_at = _now()
    job.updated_at = _now()


def fail_job(
    session: Session,
    job_id: int,
    *,
    error_code: str,
    dagster_run_id: str | None = None,
) -> None:
    job = session.get(ClimateIngestionJob, job_id, with_for_update=True)
    if job is None:
        return
    # Recovery must not overwrite a result committed since the sensor read
    # this job, or a job now owned by another run.
    if dagster_run_id is not None and (
        job.status != "running" or job.dagster_run_id != dagster_run_id
    ):
        return
    job.status = "failed"
    job.stage = "failed"
    job.error_code = error_code
    job.updated_at = _now()


def running_jobs(session: Session) -> list[ClimateIngestionJob]:
    """Started pulls whose worker may have stopped without updating this row."""
    return list(
        session.scalars(
            select(ClimateIngestionJob).where(ClimateIngestionJob.status == "running")
        )
    )


def list_jobs(
    session: Session, *, country_code: str | None = None, limit: int = 20
) -> list[IngestionJobView]:
    query = select(ClimateIngestionJob).order_by(ClimateIngestionJob.id.desc())
    if country_code:
        query = query.where(ClimateIngestionJob.country_code == country_code)
    return [
        IngestionJobView.model_validate(job, from_attributes=True)
        for job in session.scalars(query.limit(limit))
    ]


def reserve_queued_jobs(session: Session, limit: int = 1) -> list[ClimateIngestionJob]:
    """Queued jobs for the sensor to dispatch, oldest first."""
    return list(
        session.scalars(
            select(ClimateIngestionJob)
            .where(ClimateIngestionJob.status == "queued")
            .order_by(ClimateIngestionJob.created_at)
            .limit(limit)
        )
    )


def newest_complete_month(today: date) -> date:
    """The newest month ERA5 can actually be expected to have published."""
    previous = (date(today.year, today.month, 1) - timedelta(days=1)).replace(day=1)
    if today.day <= ERA5_PUBLICATION_LAG_DAYS:
        return (previous - timedelta(days=1)).replace(day=1)
    return previous


def recent_complete_months(today: date, *, count: int) -> list[date]:
    """The ``count`` newest published months, oldest first."""
    months = [newest_complete_month(today)]
    while len(months) < count:
        months.append((months[-1] - timedelta(days=1)).replace(day=1))
    return sorted(months)


def queue_recent_month_top_ups(
    session: Session, *, today: date, now: datetime | None = None
) -> list[ClimateIngestionJob]:
    """Queue a country pull wherever a deployed area lacks a recent month.

    This keeps recent observations in the database before anyone asks, so a
    planner opening last month reads stored data instead of waiting on a
    Copernicus download. A country with a pull in flight, or whose last
    automatic pull failed within ``TOP_UP_RETRY_AFTER``, is left alone.
    """
    current = now or _now()
    wanted = recent_complete_months(today, count=TOP_UP_MONTHS)
    queued: list[ClimateIngestionJob] = []
    countries = session.scalars(
        select(AppGeography.country_code)
        .join(AdminUnit, AdminUnit.app_geography_id == AppGeography.id)
        .where(AdminUnit.boundary.is_not(None))
        .distinct()
        .order_by(AppGeography.country_code)
    )
    for country_code in list(countries):
        missing = _missing_months(session, country_code, wanted)
        if not missing or live_job_for(session, country_code) is not None:
            continue
        if _recent_top_up(session, country_code, current):
            continue
        job, created = create_job(
            session,
            country_code=country_code,
            months=missing,
            requested_by_user_id=TOP_UP_REQUESTER,
        )
        if created:
            queued.append(job)
    return queued


def _missing_months(
    session: Session, country_code: str, wanted: list[date]
) -> list[date]:
    """Months some deployed area of the country holds no observation for."""
    units = [unit.id for unit in configured_areas(session, country_code)]
    held = session.execute(
        select(
            DistrictClimate.period_month,
            func.count(DistrictClimate.admin_unit_id.distinct()),
        )
        .join(ClimateRun, ClimateRun.id == DistrictClimate.climate_run_id)
        .where(
            DistrictClimate.admin_unit_id.in_(units),
            DistrictClimate.period_month.in_(wanted),
            ClimateRun.data_label.in_((DataLabel.observed, DataLabel.reanalysis)),
        )
        .group_by(DistrictClimate.period_month)
    ).all()
    complete = {month for month, count in held if count >= len(units)}
    return [month for month in wanted if month not in complete]


def _recent_top_up(session: Session, country_code: str, now: datetime) -> bool:
    """An automatic pull finished, either way, within ``TOP_UP_RETRY_AFTER``.

    A completed pull can still leave a place without the month (the grid does
    not cover it); waiting keeps that from re-pulling every evaluation.
    """
    last = session.scalar(
        select(ClimateIngestionJob)
        .where(
            ClimateIngestionJob.country_code == country_code,
            ClimateIngestionJob.requested_by_user_id == TOP_UP_REQUESTER,
        )
        .order_by(ClimateIngestionJob.id.desc())
    )
    if last is None or last.status not in ("completed", "failed"):
        return False
    finished = last.completed_at or last.updated_at
    if finished.tzinfo is None:
        finished = finished.replace(tzinfo=timezone.utc)
    return now - finished < TOP_UP_RETRY_AFTER
