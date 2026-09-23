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

from datetime import date, datetime, timezone

from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from chart.shared.db.models import (
    AdminUnit,
    AppGeography,
    ClimateIngestionJob,
    DistrictClimate,
)

#: Statuses that mean work is still expected to produce a result. A country
#: with one of these must not be queued again.
LIVE_STATUSES = ("queued", "running")


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
        earliest = [area.earliest for area in country.areas if area.earliest]
        latest = [area.latest for area in country.areas if area.latest]
        if earliest and latest:
            country.earliest = min(earliest)
            country.latest = max(latest)
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


def areas_for_country(session: Session, country_code: str) -> list[AdminUnit]:
    """Deployed areas with a boundary, which is what a pull can derive."""
    return list(
        session.scalars(
            select(AdminUnit)
            .join(AppGeography, AppGeography.id == AdminUnit.app_geography_id)
            .where(
                AppGeography.country_code == country_code,
                AdminUnit.boundary.is_not(None),
            )
            .order_by(AdminUnit.name)
        )
    )


def country_envelope(units: list[AdminUnit]) -> tuple[float, float, float, float]:
    """The one bounding box a country's download must cover.

    Returned north, west, south, east - the order CDS takes, which is the
    reverse of the ``[west, south, east, north]`` the map endpoint returns.
    Folded over the *deployed* areas, so India's box is Madhya Pradesh's
    rather than the subcontinent's, and no territory is downloaded that no
    area sits in.
    """
    # Unpacked rather than filtered in a comprehension so each corner is a
    # local the type checker can narrow to a float.
    boxes: list[tuple[float, float, float, float]] = []
    for unit in units:
        north, west = unit.bbox_north, unit.bbox_west
        south, east = unit.bbox_south, unit.bbox_east
        if north is None or west is None or south is None or east is None:
            continue
        boxes.append((north, west, south, east))
    if not boxes:
        raise ValueError("no area in this country has a bounding box")
    return (
        max(b[0] for b in boxes),
        min(b[1] for b in boxes),
        min(b[2] for b in boxes),
        max(b[3] for b in boxes),
    )


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

    units = areas_for_country(session, country_code)
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


def fail_job(session: Session, job_id: int, *, error_code: str) -> None:
    job = session.get(ClimateIngestionJob, job_id)
    if job is None:
        return
    job.status = "failed"
    job.stage = "failed"
    job.error_code = error_code
    job.updated_at = _now()


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
