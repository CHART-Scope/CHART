"""Add Kenya counties missing from a release's observed calibration.

``calibration.json`` (``chart.heat_outlook.publish.write_calibration``) shifts
ERA5 onto the scale the Kenya models were fitted on, per county and calendar
month: the model-scale 2011-2020 mean Tmax (the modeller's typical-month
table, mean of its scenarios) minus ERA5's own 2011-2020 mean. Mombasa,
Vihiga and Narok were left out of v2_2026_10_06: no ERA5 cell centre fell in
Mombasa or Vihiga at the time, and Narok's handover rows did not join.

The same two inputs are now available without the handover folder: the
release's published outlook documents carry the typical-month table (period
2011-2020, every scenario), and the database holds ERA5 2011-2020 for every
configured county. The under-five reference is the 1991-2020 annual mean of
the county's under-five outlook (the handover averaged its constituencies;
the two agree within 0.02 deg C on the counties checked).

Before writing, the script recomputes every county already in the file and
refuses to continue unless nearly all reproduce exactly (43 of 44 for
v2_2026_10_06; Nakuru's handover rows differ from its published outlook), so
the method is proven on the existing release first. Existing entries are
never changed::

    DATABASE_URL=... python core/scripts/kenya_calibration_extend.py \\
        core/chart/heat_outlook/releases/v2_2026_10_06/calibration.json
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path
from statistics import mean

from sqlalchemy import select
from sqlalchemy.orm import Session

from chart.heat_outlook.service import LBW_OUTCOME, U5_OUTCOME, load_outlook
from chart.shared.db.models import AdminUnit, ClimateRun, DataLabel, DistrictClimate
from chart.shared.db.session import get_session_factory

SCENARIOS = ("ssp126", "ssp370", "ssp585")
#: A published county reproduces when every offset is within this (deg C).
TOLERANCE_C = 0.002
#: Refuse to add counties when more than this share fails to reproduce.
MAX_DIFFERING_SHARE = 0.1


def model_scale(geography_id: str) -> list[float]:
    by_month: dict[int, list[float]] = defaultdict(list)
    for scenario in SCENARIOS:
        document = load_outlook(
            geography_id, LBW_OUTCOME, scenario=scenario, period="2011-2020"
        )
        for month in document.months:
            if month.tmax_c is not None:
                by_month[month.month].append(month.tmax_c)
    return [mean(by_month[month]) for month in range(1, 13)]


def u5_reference(geography_id: str) -> float:
    document = load_outlook(geography_id, U5_OUTCOME, period="1991-2020")
    return mean(month.tmax_c for month in document.months if month.tmax_c is not None)


def era5_climatology(session: Session, geography_id: str) -> list[float]:
    unit = session.scalar(
        select(AdminUnit).where(AdminUnit.app_geography_id == geography_id)
    )
    if unit is None:
        raise LookupError(geography_id)
    newest: dict[date, tuple[int, float]] = {}
    for month, value, run in session.execute(
        select(DistrictClimate.period_month, DistrictClimate.value, ClimateRun.id)
        .join(ClimateRun, ClimateRun.id == DistrictClimate.climate_run_id)
        .where(
            DistrictClimate.admin_unit_id == unit.id,
            DistrictClimate.variable == "tmax_monthly_mean_c",
            ClimateRun.data_label.in_((DataLabel.observed, DataLabel.reanalysis)),
            DistrictClimate.period_month.between(date(2011, 1, 1), date(2020, 12, 1)),
        )
    ):
        if month not in newest or run > newest[month][0]:
            newest[month] = (run, float(value))
    by_month: dict[int, list[float]] = defaultdict(list)
    for month, (_, value) in newest.items():
        by_month[month.month].append(value)
    if any(len(by_month[month]) != 10 for month in range(1, 13)):
        raise ValueError(f"{geography_id}: ERA5 2011-2020 is incomplete")
    return [mean(by_month[month]) for month in range(1, 13)]


def offsets(session: Session, geography_id: str) -> list[float]:
    return [
        round(scale - era5, 3)
        for scale, era5 in zip(
            model_scale(geography_id), era5_climatology(session, geography_id)
        )
    ]


def main(argv: list[str]) -> None:
    path = Path(argv[1])
    document = json.loads(path.read_text())
    counties = document["counties"]
    with get_session_factory()() as session:
        differing = []
        for geography_id, entry in counties.items():
            got = offsets(session, geography_id)
            worst = max(abs(a - b) for a, b in zip(got, entry["offset_c"]))
            if worst > TOLERANCE_C:
                differing.append(f"{geography_id} ({worst:.3f} deg C)")
        # v2_2026_10_06: 43 of 44 reproduce exactly; Nakuru's handover rows
        # differ from its published outlook. Published values are kept as
        # they are; only a method that reproduces nearly all may add more.
        print(
            f"reproduced {len(counties) - len(differing)} of {len(counties)} "
            f"published counties; differing: {', '.join(differing) or 'none'}"
        )
        if len(differing) > MAX_DIFFERING_SHARE * len(counties):
            raise SystemExit("too many counties differ; not writing")
        configured = session.scalars(
            select(AdminUnit.app_geography_id).where(
                AdminUnit.level == "county",
                AdminUnit.app_geography_id.like("geo-ke-%"),
            )
        )
        for geography_id in sorted(set(configured) - set(counties)):
            counties[geography_id] = {
                "offset_c": offsets(session, geography_id),
                "u5_reference_tmax_c": round(u5_reference(geography_id), 3),
                "derived": (
                    "kenya_calibration_extend.py: published outlook 2011-2020 "
                    "typical months and stored ERA5 2011-2020"
                ),
            }
            print(f"added {geography_id}: {counties[geography_id]}")
    path.write_text(json.dumps(document, indent=1) + "\n")


if __name__ == "__main__":
    main(sys.argv)
