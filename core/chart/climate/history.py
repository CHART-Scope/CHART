"""Fill a country's observed climate history once, then verify it is complete.

``python -m chart.climate.history backfill --country IN --years 2`` pulls ERA5
for every configured place of the country (``country_pull.configured_areas``)
from January of ``years`` years ago to the newest published month, two
calendar years per Copernicus round, committing as it goes. Re-running skips
what is stored, so a longer history (2, then 5, 10, 20 years) only downloads
the years it adds. India's observed estimates are then scored for every
modelled area and month, so the dashboard reads stored results instead of
scoring on a click. Kenya's calibrated scorer reads the stored climate
directly and needs no precompute.

``verify`` lists every place-month still missing.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from typing import cast
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from chart.heat_outlook.service import legacy_observed_supported, published_index
from chart.shared.db.models import (
    ActiveModelAssignment,
    AdminUnit,
    ClimateRun,
    DataLabel,
    DistrictClimate,
)
from chart.shared.db.session import get_session_factory

from .country_pull import configured_areas, pull_country_months
from .ingestion_jobs import newest_complete_month

OBSERVED_LABELS = (DataLabel.observed, DataLabel.reanalysis)
MONTHLY_VARIABLE = "tmax_monthly_mean_c"
#: Calendar years fetched per Copernicus round; one request per year runs in
#: parallel on the download workers.
YEARS_PER_ROUND = max(1, int(os.getenv("ERA5_DOWNLOAD_WORKERS", "2")))
#: The R models read up to three months before the scored month, so the
#: first months of the history cannot be scored from it.
SCORING_LEAD_MONTHS = 3


@dataclass
class Coverage:
    country_code: str
    first_month: date
    last_month: date
    places: int
    months: int
    missing: dict[str, list[str]] = field(default_factory=dict)

    @property
    def complete(self) -> bool:
        return not self.missing


@dataclass
class BackfillReport:
    country_code: str
    pulled_years: list[int] = field(default_factory=list)
    skipped_places: dict[str, str] = field(default_factory=dict)
    #: Area-outcome-months holding a stored estimate (new or already stored).
    scored: int = 0
    unscored: dict[str, str] = field(default_factory=dict)
    coverage: Coverage | None = None


def history_months(years: int, today: date) -> list[date]:
    """January ``years`` years before the newest published month, to that month."""
    if years < 1:
        raise ValueError("years must be at least 1")
    newest = newest_complete_month(today)
    month = date(newest.year - years, 1, 1)
    months = []
    while month <= newest:
        months.append(month)
        month = date(month.year + month.month // 12, month.month % 12 + 1, 1)
    return months


def coverage(session: Session, country_code: str, months: list[date]) -> Coverage:
    """Which configured place-months hold no observed monthly climate."""
    units = configured_areas(session, country_code)
    held = {
        (unit_id, month)
        for unit_id, month in session.execute(
            select(DistrictClimate.admin_unit_id, DistrictClimate.period_month)
            .join(ClimateRun, ClimateRun.id == DistrictClimate.climate_run_id)
            .where(
                DistrictClimate.admin_unit_id.in_([unit.id for unit in units]),
                DistrictClimate.variable == MONTHLY_VARIABLE,
                DistrictClimate.period_month.between(months[0], months[-1]),
                ClimateRun.data_label.in_(OBSERVED_LABELS),
            )
            .distinct()
        )
    }
    missing: dict[str, list[str]] = {}
    for unit in units:
        gaps = [f"{month:%Y-%m}" for month in months if (unit.id, month) not in held]
        if gaps:
            missing[unit.app_geography_id or unit.code] = gaps
    return Coverage(
        country_code=country_code,
        first_month=months[0],
        last_month=months[-1],
        places=len(units),
        months=len(months),
        missing=missing,
    )


def backfill(
    country_code: str,
    years: int,
    *,
    today: date | None = None,
    score: bool = True,
    session_factory: sessionmaker[Session] | None = None,
    log: Callable[[str], None] = print,
) -> BackfillReport:
    factory = session_factory or get_session_factory()
    months = history_months(years, today or date.today())
    report = BackfillReport(country_code=country_code)
    with factory() as session:
        gaps = coverage(session, country_code, months)
    missing_years = sorted(
        {int(month[:4]) for place in gaps.missing.values() for month in place}
    )
    source = "model configuration" if published_index() else "every registered place"
    log(
        f"{country_code}: {gaps.places} places ({source}),"
        f" {months[0]:%Y-%m}..{months[-1]:%Y-%m};"
        f" years to pull: {missing_years or 'none'}"
    )
    for start in range(0, len(missing_years), YEARS_PER_ROUND):
        chunk = missing_years[start : start + YEARS_PER_ROUND]
        # Whole years keep each Copernicus request, so its cache entry, stable
        # whichever places were missing it.
        outcome = pull_country_months(
            factory,
            country_code,
            [month for month in months if month.year in chunk],
            log=log,
        )
        report.pulled_years.extend(chunk)
        report.skipped_places.update(outcome.skipped)
        log(
            f"{country_code} {chunk}: {outcome.areas_done}/{outcome.areas_total} places,"
            f" {outcome.monthly_rows} monthly and {outcome.daily_rows} daily rows"
        )
    if score:
        score_observed(factory, country_code, months[SCORING_LEAD_MONTHS:], report, log)
    with factory() as session:
        report.coverage = coverage(session, country_code, months)
    return report


def score_observed(
    factory: sessionmaker[Session],
    country_code: str,
    months: list[date],
    report: BackfillReport,
    log: Callable[[str], None] = print,
) -> None:
    """Store an observed estimate for every modelled area, outcome and month.

    Goes through the same request path as the dashboard, which returns a
    stored result without scoring it again.
    """
    # Imported here: the request path loads the model registry and scoring
    # clients, which pulling climate does not need.
    from chart.heat_outlook.observed_stored import live_model_release
    from chart.heat_outlook.service import LBW_OUTCOME

    from .requests import submit_prediction
    from .schemas import PredictRequest, PredictResponse, PregnancyWindow

    with factory() as session:
        rows = session.execute(
            select(AdminUnit.app_geography_id, ActiveModelAssignment.outcome)
            .join(
                ActiveModelAssignment,
                ActiveModelAssignment.admin_unit_id == AdminUnit.id,
            )
            .where(AdminUnit.app_geography_id.like(f"geo-{country_code.lower()}-%"))
            .order_by(AdminUnit.app_geography_id, ActiveModelAssignment.outcome)
        ).all()
        # Kenya's counties are shown by the calibrated scorer, which reads the
        # stored climate directly; scoring them through R would go unread.
        # Every validated pregnancy window is stored, so the dashboard can
        # offer whichever the country settings leave on.
        assigned: list[tuple[str, str, tuple[PregnancyWindow, ...] | None]] = []
        for geography_id, outcome in rows:
            if not geography_id or legacy_observed_supported(
                session, geography_id, outcome
            ):
                continue
            found = live_model_release(session, geography_id, outcome)
            validated = cast(
                tuple[PregnancyWindow, ...],
                found[3] if found and outcome == LBW_OUTCOME else (),
            )
            assigned.append((geography_id, outcome, validated or None))
    if not assigned:
        log(f"{country_code}: no live observed model to score")
        return
    log(f"{country_code}: scoring {len(assigned)} area-outcomes x {len(months)} months")
    for geography_id, outcome, stages in assigned:
        for month in months:
            key = f"{geography_id} {outcome} {month:%Y-%m}"
            try:
                response = submit_prediction(
                    PredictRequest(
                        geography_id=geography_id,
                        planning_date=month,
                        outcome=outcome,
                        pregnancy_windows=stages,
                    ),
                    session_factory=factory,
                )
            except Exception as error:  # noqa: BLE001 - reported per month
                report.unscored[key] = getattr(error, "code", type(error).__name__)
                continue
            if isinstance(response, PredictResponse):
                report.scored += 1
            else:
                report.unscored[key] = "queued"
    log(f"{country_code}: {report.scored} stored, {len(report.unscored)} not scored")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m chart.climate.history")
    parser.add_argument("command", choices=["backfill", "verify", "score"])
    parser.add_argument("--country", required=True, help="ISO code, e.g. IN or KE")
    parser.add_argument("--years", type=int, default=2)
    parser.add_argument(
        "--no-score", action="store_true", help="Pull climate without scoring"
    )
    args = parser.parse_args(argv)
    # Progress must reach a log file or `docker exec` as it happens.
    sys.stdout.reconfigure(line_buffering=True)  # type: ignore[union-attr]
    country = args.country.upper()
    if args.command == "backfill":
        report = backfill(country, args.years, score=not args.no_score)
        result = report.coverage
        print(json.dumps(asdict(report), indent=2, default=str))
    elif args.command == "score":
        # Score the stored months only, e.g. after a model or window change.
        factory = get_session_factory()
        months = history_months(args.years, date.today())
        scored = BackfillReport(country_code=country)
        score_observed(factory, country, months[SCORING_LEAD_MONTHS:], scored)
        print(json.dumps(asdict(scored), indent=2, default=str))
        return 0 if not scored.unscored else 1
    else:
        with get_session_factory()() as session:
            result = coverage(
                session, country, history_months(args.years, date.today())
            )
        print(json.dumps(asdict(result), indent=2, default=str))
    assert result is not None
    if not result.complete:
        print(
            f"{country}: {len(result.missing)} of {result.places} places have gaps",
            file=sys.stderr,
        )
        return 1
    print(f"{country}: all {result.places} places hold {result.months} months")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
