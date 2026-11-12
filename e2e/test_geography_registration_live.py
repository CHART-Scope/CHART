"""Repeated publication registration preserves existing model input boundaries."""

from copy import deepcopy
import json
import os
from pathlib import Path
import subprocess
import sys

from geoalchemy2.shape import from_shape, to_shape
from shapely.geometry import MultiPolygon, box
from sqlalchemy import select

from chart.shared.db.models import AdminUnit

ROOT = Path(__file__).resolve().parents[1]
FIELDS = (
    "bbox_north",
    "bbox_west",
    "bbox_south",
    "bbox_east",
    "boundary_version",
    "boundary_provenance",
)


def snapshot(unit):
    return {
        "geometry": to_shape(unit.boundary),
        **{key: deepcopy(getattr(unit, key)) for key in FIELDS},
    }


def matches(unit, expected):
    assert to_shape(unit.boundary).equals_exact(expected["geometry"], tolerance=0)
    for key in FIELDS:
        assert getattr(unit, key) == expected[key], key


def test_republication_preserves_calibrated_boundaries_and_updates_unassigned_areas(
    jobs,
):
    # jobs supplies the explicit disposable DB guard and a real admin login.
    factory, _queue = jobs
    protected = {
        "geo-in-madhya-pradesh-division-bhopal",  # Active model assignment from seed.
        "geo-ke-kajiado",  # Shipped county calibration, without an R assignment.
    }
    unassigned = {
        "geo-in-madhya-pradesh-district-bhopal",
        "geo-ke-constituency-kajiado-central",
    }
    originals = {}
    retained = {}
    evidence = Path(os.environ["CHART_E2E_EVIDENCE"])
    try:
        with factory() as session, session.begin():
            units = list(
                session.scalars(
                    select(AdminUnit).where(
                        AdminUnit.app_geography_id.in_(protected | unassigned)
                    )
                )
            )
            assert len(units) == 4
            for unit in units:
                originals[unit.app_geography_id] = snapshot(unit)
                west = (unit.bbox_west + unit.bbox_east) / 2
                south = (unit.bbox_south + unit.bbox_north) / 2
                unit.boundary = from_shape(
                    MultiPolygon([box(west, south, west + 0.01, south + 0.01)]),
                    srid=4326,
                )
                unit.bbox_west, unit.bbox_south = west, south
                unit.bbox_east, unit.bbox_north = west + 0.01, south + 0.01
                unit.boundary_version = "disposable-existing-calibration-edition"
                unit.boundary_provenance = {
                    "source": "disposable pre-publication fixture",
                    "purpose": "calibration boundary preservation",
                }
                retained[unit.app_geography_id] = snapshot(unit)
        for attempt in (1, 2):
            log_path = evidence / f"boundary-preservation-registration-{attempt}.log"
            with log_path.open("w") as log:
                result = subprocess.run(
                    [
                        sys.executable,
                        "-m",
                        "chart.heat_outlook.geography",
                        str(Path(os.environ["MODEL_CACHE_DIR"]) / "outlooks"),
                    ],
                    cwd=ROOT,
                    check=False,
                    stdout=log,
                    stderr=subprocess.STDOUT,
                )
            assert result.returncode == 0, log_path.read_text()
            with factory() as session:
                for unit in session.scalars(
                    select(AdminUnit).where(
                        AdminUnit.app_geography_id.in_(protected | unassigned)
                    )
                ):
                    identifier = unit.app_geography_id
                    matches(
                        unit,
                        (
                            retained[identifier]
                            if identifier in protected
                            else originals[identifier]
                        ),
                    )
        (evidence / "boundary-preservation.json").write_text(
            json.dumps(
                {
                    "result": "passed",
                    "preserved": sorted(protected),
                    "updated_to_publication": sorted(unassigned),
                    "registration_attempts": 2,
                },
                indent=2,
            )
            + "\n"
        )
    finally:
        # Later browser/scientific checks continue with the original fixture.
        with factory() as session, session.begin():
            for unit in session.scalars(
                select(AdminUnit).where(AdminUnit.app_geography_id.in_(originals))
            ):
                original = originals[unit.app_geography_id]
                unit.boundary = from_shape(original["geometry"], srid=4326)
                for key in FIELDS:
                    setattr(unit, key, original[key])
