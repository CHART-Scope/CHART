import json
import os
from datetime import date
from pathlib import Path

import dagster as dg
from era5_heat import compute_heat_series, fixture_demo
from era5_heat.districts import PRESETS
from era5_heat.io import output_paths, write_json, write_table

from chart.climate.requests import (
    complete_prediction_request,
    fail_prediction_request,
    list_queued_prediction_requests,
    mark_prediction_request_running,
    set_prediction_request_stage,
)
from chart.climate.service import ClimateServiceError
from chart.shared.db.climate_load import load_era5_monthly_frame
from chart.shared.db.session import get_session_factory

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_OUTDIR = REPO_ROOT / "data" / "climate"
MVP_YEARS = int(os.getenv("ERA5_MVP_YEARS", "5"))
MVP_END_YEAR = int(os.getenv("ERA5_MVP_END_YEAR", str(date.today().year - 1)))

GEOGRAPHY_PARTITIONS = dg.StaticPartitionsDefinition(sorted(PRESETS.keys()))


class Era5ClimateConfig(dg.Config):
    years: int = MVP_YEARS
    end_year: int = MVP_END_YEAR
    use_fixture: bool = False
    load_database: bool = True


class PredictionRequestConfig(dg.Config):
    request_id: int
    location_slug: str
    end_year: int
    use_fixture: bool = False


def _prepare_era5_climate(
    context: dg.AssetExecutionContext | dg.OpExecutionContext,
    config: Era5ClimateConfig,
    *,
    preset_slug: str,
) -> dict:
    if preset_slug not in PRESETS:
        raise dg.Failure(
            f"Unknown partition {preset_slug!r}. Choose from: {sorted(PRESETS)}"
        )

    preset = PRESETS[preset_slug]
    outdir = Path(os.getenv("CLIMATE_OUTPUT_DIR", DEFAULT_OUTDIR))
    outdir.mkdir(parents=True, exist_ok=True)

    if config.use_fixture or os.getenv("ERA5_USE_FIXTURE") == "1":
        context.log.info("Using offline fixture data (no CDS credentials required).")
        df, meta = fixture_demo(
            preset_slug, years=config.years, end_year=config.end_year
        )
    else:
        if not _cds_credentials_available():
            raise ClimateServiceError("CLIMATE_INGEST_NOT_CONFIGURED", 503)
        context.log.info(
            "Downloading ERA5 for %s (%s-%s)",
            preset.name,
            config.end_year - config.years + 1,
            config.end_year,
        )
        df, meta = compute_heat_series(
            district=preset.name,
            bbox=preset.bbox,
            years=config.years,
            end_year=config.end_year,
        )

    table_path, meta_path = output_paths(
        outdir,
        district=preset_slug,
        start_year=meta["window"]["start_year"],
        end_year=meta["window"]["end_year"],
        table_format="csv",
    )
    write_table(df, table_path, "csv")
    write_json(meta, meta_path)

    metadata = {
        "preset": preset_slug,
        "district": preset.name,
        "rows": len(df),
        "csv_path": str(table_path),
        "meta_path": str(meta_path),
        "data_status": meta.get("data_status"),
        "window": json.dumps(meta.get("window", {})),
    }

    if config.load_database and os.getenv("DATABASE_URL"):
        session_factory = get_session_factory()
        with session_factory() as session:
            climate_run = load_era5_monthly_frame(
                session,
                preset_slug=preset_slug,
                df=df,
                meta=meta,
                csv_path=str(table_path),
            )
            session.commit()
            metadata["climate_run_id"] = climate_run.id
            metadata["input_hash"] = climate_run.input_hash
        context.log.info(
            "Loaded climate_run_id=%s into Postgres", metadata["climate_run_id"]
        )
    else:
        context.log.warning(
            "Skipped database load. Set DATABASE_URL and config.load_database=true to persist."
        )

    return metadata


def _cds_credentials_available() -> bool:
    if os.getenv("CDSAPI_KEY"):
        return True
    credentials_file = Path(
        os.getenv("CDSAPI_RC", Path.home() / ".cdsapirc")
    ).expanduser()
    return credentials_file.is_file()


@dg.asset(
    group_name="climate",
    partitions_def=GEOGRAPHY_PARTITIONS,
    description="Observed ERA5 monthly heat metrics per MVP geography preset.",
)
def era5_observed_climate(
    context: dg.AssetExecutionContext,
    config: Era5ClimateConfig,
) -> dg.MaterializeResult:
    metadata = _prepare_era5_climate(
        context,
        config,
        preset_slug=context.partition_key,
    )
    return dg.MaterializeResult(metadata=metadata)


@dg.op
def process_prediction_request(
    context: dg.OpExecutionContext,
    config: PredictionRequestConfig,
) -> None:
    mark_prediction_request_running(
        config.request_id,
        dagster_run_id=context.run_id,
    )

    try:
        try:
            prediction = complete_prediction_request(config.request_id)
        except ClimateServiceError as error:
            if error.code != "CLIMATE_DATA_NOT_READY":
                raise
            set_prediction_request_stage(config.request_id, "preparing_climate")
            metadata = _prepare_era5_climate(
                context,
                Era5ClimateConfig(
                    years=MVP_YEARS,
                    end_year=config.end_year,
                    use_fixture=config.use_fixture,
                    load_database=True,
                ),
                preset_slug=config.location_slug,
            )
            context.log_event(
                dg.AssetMaterialization(
                    asset_key="era5_observed_climate",
                    partition=config.location_slug,
                    metadata=metadata,
                )
            )
            set_prediction_request_stage(config.request_id, "predicting")
            prediction = complete_prediction_request(config.request_id)

        context.log.info(
            "Completed prediction_request_id=%s odds_ratio=%s",
            config.request_id,
            prediction.prediction.odds_ratio if prediction.prediction else None,
        )
    except Exception as error:
        fail_prediction_request(
            config.request_id,
            error_code=getattr(error, "code", type(error).__name__),
        )
        raise


@dg.job(description="Run one idempotent user-requested prediction.")
def prediction_request_job():
    process_prediction_request()


era5_observed_climate_job = dg.define_asset_job(
    name="era5_observed_climate_job",
    selection=[era5_observed_climate],
    description="Materialise ERA5 observed climate for all geography partitions.",
)


@dg.schedule(
    cron_schedule="0 6 5 * *",
    job=era5_observed_climate_job,
    default_status=dg.DefaultScheduleStatus.STOPPED,
)
def monthly_era5_refresh_schedule(context: dg.ScheduleEvaluationContext):
    """Run on the 5th of each month for each geography partition."""
    end_year = date.today().year - 1
    use_fixture = os.getenv("ERA5_USE_FIXTURE") == "1"
    for partition_key in GEOGRAPHY_PARTITIONS.get_partition_keys():
        yield dg.RunRequest(
            partition_key=partition_key,
            run_key=f"{partition_key}:{end_year}:{context.scheduled_execution_time}",
            run_config={
                "ops": {
                    "era5_observed_climate": {
                        "config": {
                            "years": MVP_YEARS,
                            "end_year": end_year,
                            "use_fixture": use_fixture,
                            "load_database": True,
                        }
                    }
                }
            },
            tags={
                "cadence": "monthly",
                "tier": "observed",
                "preset": partition_key,
            },
        )


@dg.sensor(
    job=prediction_request_job,
    minimum_interval_seconds=5,
    default_status=dg.DefaultSensorStatus.RUNNING,
)
def pending_prediction_requests_sensor(_context: dg.SensorEvaluationContext):
    """Launch one Dagster run for each durable API prediction request."""
    queued_requests = list_queued_prediction_requests()
    if not queued_requests:
        yield dg.SkipReason("No queued prediction requests.")
        return

    use_fixture = os.getenv("ERA5_USE_FIXTURE") == "1"
    for request in queued_requests:
        end_year = int(request.end_month[:4]) if request.end_month else MVP_END_YEAR
        yield dg.RunRequest(
            run_key=(
                f"prediction-request:{request.id}:attempt:{request.attempt_count}"
            ),
            run_config={
                "ops": {
                    "process_prediction_request": {
                        "config": {
                            "request_id": request.id,
                            "location_slug": request.location_slug,
                            "end_year": end_year,
                            "use_fixture": use_fixture,
                        }
                    }
                }
            },
            tags={
                "trigger": "prediction-request",
                "prediction_request_id": str(request.id),
                "tier": "observed",
                "preset": request.location_slug,
            },
        )


defs = dg.Definitions(
    assets=[era5_observed_climate],
    jobs=[era5_observed_climate_job, prediction_request_job],
    schedules=[monthly_era5_refresh_schedule],
    sensors=[pending_prediction_requests_sensor],
)
