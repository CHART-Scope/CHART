"""Disposable persisted observations/results for the live dashboard regression.

Kenya exercises the shipped calibrated scorer on complete month/day inputs.
India exercises retrieval of existing results, not a new R-model calculation.
The synthetic values below are test fixtures, never scientific validation data.
"""

from calendar import monthrange
import csv
from datetime import date, datetime, timedelta, timezone
import json
from pathlib import Path

from sqlalchemy import select

from chart.shared.db.climate_load import ERA5_DATA_SOURCE_NAME
from chart.shared.db.models import (
    ActiveModelAssignment,
    AdminUnit,
    ClimateRun,
    DataLabel,
    DataSource,
    DistrictClimate,
    DistrictClimateDay,
    ModelAreaMapping,
    ModelRelease,
    PredictionResult,
    Provenance,
)
from chart.shared.db.session import get_session_factory

ROOT = Path(__file__).resolve().parents[1]
INDIA = "geo-in-madhya-pradesh-division-bhopal"
KENYA = "geo-ke-kajiado"


def main() -> None:
    with get_session_factory()() as session, session.begin():
        units = {
            unit.app_geography_id: unit
            for unit in session.scalars(
                select(AdminUnit).where(AdminUnit.app_geography_id.in_([INDIA, KENYA]))
            )
        }
        source = DataSource(name=ERA5_DATA_SOURCE_NAME, kind="reanalysis")
        provenance = Provenance(
            source_uri="fixture://observed-dashboard-regression",
            input_hash="observed-dashboard-regression",
        )
        session.add_all([source, provenance])
        session.flush()
        run = ClimateRun(
            data_source_id=source.id,
            provenance_id=provenance.id,
            tier="observed",
            source_name="Disposable ERA5-shaped fixture",
            input_hash="observed-dashboard-regression",
            data_label=DataLabel.reanalysis,
            generated_at=datetime(2026, 10, 1, tzinfo=timezone.utc),
        )
        session.add(run)
        session.flush()
        calibration = json.loads(
            (
                ROOT / "core/chart/heat_outlook/releases/v2_2026_10_06/calibration.json"
            ).read_text()
        )["counties"][KENYA]
        with (
            ROOT / "core/tests/fixtures/kenya_dlnm/lbw_validation_cases.csv"
        ).open() as f:
            case = next(csv.DictReader(f))
        for month in range(1, 10):
            for place in (INDIA, KENYA):
                days = monthrange(2026, month)[1]
                # Reproduce R validation case 1 on the model's scale for Kenya.
                value = (
                    float(case[f"tmax_lag{9 - month}"])
                    - calibration["offset_c"][month - 1]
                    if place == KENYA
                    else 30.0
                )
                session.add(
                    DistrictClimate(
                        admin_unit_id=units[place].id,
                        climate_run_id=run.id,
                        period_month=date(2026, month, 1),
                        variable="tmax_monthly_mean_c",
                        value=value,
                        unit="degC",
                        observed_days=days,
                        expected_days=days,
                    )
                )
        first = date(2026, 8, 29)
        for offset in range(33):
            day = first + timedelta(days=offset)
            session.add(
                DistrictClimateDay(
                    admin_unit_id=units[KENYA].id,
                    climate_run_id=run.id,
                    period_date=day,
                    variable="tmax_c",
                    value=30.0 - calibration["offset_c"][day.month - 1],
                    unit="degC",
                )
            )
        for path in (
            "lbw/model-release.mp.compact.review.json",
            "under_five_mortality/model-release.mp.review.json",
        ):
            manifest = json.loads((ROOT / "pipelines/models" / path).read_text())
            release = ModelRelease(
                id=manifest["id"],
                module="prediction",
                outcome=manifest["outcome"],
                version=manifest["version"],
                status="active",
                climate_hazard=manifest["climate_hazard"],
                health_domain=manifest["health_domain"],
                model_files=manifest["model_files"],
                input_spec={
                    key: manifest[key]
                    for key in (
                        "input_contract",
                        "output_contract",
                        "presentation",
                        "runtime",
                    )
                },
                release_file_uri=manifest["base_uri"] + "/model-release.json",
            )
            session.add(release)
            prior = ModelRelease(
                id="e2e-prior-" + release.outcome,
                module="prediction",
                outcome=release.outcome,
                version="fixture-prior",
                status="superseded",
                model_files=manifest["model_files"],
                input_spec=release.input_spec,
            )
            session.add(prior)
            session.flush()
            session.add_all(
                [
                    ModelAreaMapping(
                        model_release_id=release.id,
                        admin_unit_id=units[INDIA].id,
                        model_area_key="Bhopal",
                        model_file=manifest["model_files"][0]["filename"],
                    ),
                    ActiveModelAssignment(
                        admin_unit_id=units[INDIA].id,
                        module="prediction",
                        outcome=release.outcome,
                        model_release_id=release.id,
                    ),
                ]
            )
            for month in (8, 9):
                session.add(
                    PredictionResult(
                        admin_unit_id=units[INDIA].id,
                        outcome=release.outcome,
                        model_release_id=prior.id if month == 8 else release.id,
                        valid_month=date(2026, month, 1),
                        scenario="seas5_ensemble",
                        horizon="m1",
                        pregnancy_window=1 if release.outcome == "lbw" else 0,
                        odds_ratio=1.25 if release.outcome == "lbw" else 1.1,
                        ci95_low=1.05,
                        ci95_high=1.5,
                        attributable_fraction_milli=(
                            200 if release.outcome == "lbw" else 91
                        ),
                        reference_temperature_c=27.0,
                        reference_kind="editorial",
                        model_version=release.version,
                        model_artifact_sha256=manifest["model_files"][0]["sha256"],
                        exposure_values_c=[30.0]
                        * (3 if release.outcome == "lbw" else 4),
                        data_label=DataLabel.reanalysis,
                    )
                )
    print("Persisted disposable observed fixtures for Kenya and India")


if __name__ == "__main__":
    main()
