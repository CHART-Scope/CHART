from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Callable

from sqlalchemy import select
from sqlalchemy.orm import Session

from chart.shared.db.models import (
    AdminUnit,
    ClimateRun,
    DataSource,
    DistrictClimate,
    Geography,
)
from chart.shared.db.session import get_session_factory

from .catalog import (
    ERA5_SOURCE_NAME,
    LBW_DEFAULT_STATE_AREA,
    LOCATIONS,
    LOCATION_SLUGS,
    TIMEFRAMES,
    TIMEFRAME_IDS,
    ClimateLocationSlug,
    Location,
    Timeframe,
)
from .schemas import (
    Availability,
    AvailabilityStatus,
    LbwPrediction,
    LocationResponse,
    MonthValue,
    PredictRequest,
    PredictResponse,
    PreviewRequest,
    PreviewResponse,
    TimeframeResponse,
)


class ClimateServiceError(Exception):
    def __init__(self, code: str, status_code: int) -> None:
        super().__init__(code)
        self.code = code
        self.status_code = status_code


@dataclass
class ClimateContext:
    slug: str
    admin_unit_id: int
    last_refreshed_at: datetime | None
    climate_run_id: int | None
    window_start_year: int | None
    window_end_year: int | None
    data_label: str | None


def list_locations() -> dict[str, list[LocationResponse]]:
    return {"items": [_location_response(LOCATIONS[slug]) for slug in LOCATION_SLUGS]}


def list_timeframes() -> dict[str, list[TimeframeResponse]]:
    return {
        "items": [
            _timeframe_response(TIMEFRAMES[timeframe_id])
            for timeframe_id in TIMEFRAME_IDS
        ]
    }


def preview(
    request: PreviewRequest,
    *,
    session_factory=None,
    now: Callable[[], datetime] | None = None,
) -> PreviewResponse:
    now_fn = now or (lambda: datetime.now(timezone.utc))
    location = LOCATIONS[request.location_slug]
    timeframe = TIMEFRAMES[request.timeframe_id]

    if timeframe.tier != "observed":
        return PreviewResponse(
            location=_location_response(location),
            timeframe=_timeframe_response(timeframe),
            availability=_unavailable_availability(request, timeframe, None),
            series=[],
        )

    session_factory = session_factory or get_session_factory()
    with session_factory() as session:
        return _build_preview(session, request, now_fn)


def predict(
    request: PredictRequest,
    *,
    session_factory=None,
    lbw_service_url: str | None = None,
    now: Callable[[], datetime] | None = None,
) -> PredictResponse:
    session_factory = session_factory or get_session_factory()
    now_fn = now or (lambda: datetime.now(timezone.utc))
    lbw_url = (
        lbw_service_url
        if lbw_service_url is not None
        else os.getenv("LBW_SERVICE_URL", "")
    )

    with session_factory() as session:
        preview_body = _build_preview(session, request, now_fn)

    if request.outcome is None:
        return PredictResponse(
            **preview_body.model_dump(),
            prediction=None,
            prediction_note="No outcome requested. Pass outcome.type=lbw to run LBW prediction.",
        )

    validate_prediction_request(request)

    if preview_body.availability.status not in {"ready", "stale"}:
        raise ClimateServiceError("CLIMATE_DATA_NOT_READY", 409)

    tmax_lag = [point.tmax_monthly_mean_c for point in reversed(preview_body.series)]
    if len(tmax_lag) != 3:
        raise ClimateServiceError("CLIMATE_DATA_NOT_READY", 409)

    if not lbw_url:
        raise ClimateServiceError("LBW_SERVICE_NOT_CONFIGURED", 503)

    prediction = _call_lbw_predict(
        lbw_url,
        area=request.outcome.area or LBW_DEFAULT_STATE_AREA,
        trimester=request.outcome.trimester,
        tmax_lag=tmax_lag,
        ref=request.outcome.ref,
    )

    return PredictResponse(
        **preview_body.model_dump(), prediction=prediction, prediction_note=None
    )


def validate_prediction_request(request: PredictRequest) -> None:
    """Reject unsupported prediction work before it enters the durable queue."""
    if request.outcome is None:
        return
    if request.outcome.type != "lbw":
        raise ClimateServiceError("UNSUPPORTED_OUTCOME", 400)
    if not LOCATIONS[request.location_slug].supports_lbw_prediction:
        raise ClimateServiceError("LBW_NOT_AVAILABLE_FOR_LOCATION", 400)
    if request.timeframe_id != "exposure_3m":
        raise ClimateServiceError("LBW_REQUIRES_EXPOSURE_TIMEFRAME", 400)


def _build_preview(
    session: Session, request: PreviewRequest, now: Callable[[], datetime]
) -> PreviewResponse:
    location = LOCATIONS[request.location_slug]
    timeframe = TIMEFRAMES[request.timeframe_id]

    context = _load_context(session, request.location_slug)
    if context is None or context.climate_run_id is None:
        return PreviewResponse(
            location=_location_response(location),
            timeframe=_timeframe_response(timeframe),
            availability=_missing_availability(request, timeframe, context),
            series=[],
        )

    all_months = _load_monthly_tmax(
        session, context.admin_unit_id, context.climate_run_id
    )
    anchor_month = _resolve_anchor_month(all_months, request.end_month)
    target_months = _resolve_target_months(timeframe, all_months, anchor_month, context)
    series = _pick_series(all_months, target_months)
    availability = _build_availability(
        request, timeframe, context, target_months, series, now
    )

    return PreviewResponse(
        location=_location_response(location),
        timeframe=_timeframe_response(timeframe),
        availability=availability,
        series=series,
    )


def _load_context(session: Session, slug: ClimateLocationSlug) -> ClimateContext | None:
    stmt = (
        select(
            Geography.slug.label("slug"),
            AdminUnit.id.label("admin_unit_id"),
            DataSource.last_refreshed_at.label("last_refreshed_at"),
            ClimateRun.id.label("climate_run_id"),
            ClimateRun.window_start_year.label("window_start_year"),
            ClimateRun.window_end_year.label("window_end_year"),
            ClimateRun.data_label.label("data_label"),
        )
        .select_from(Geography)
        .join(
            AdminUnit,
            (AdminUnit.geography_id == Geography.id)
            & (AdminUnit.code == Geography.slug),
        )
        .outerjoin(
            DataSource,
            (DataSource.geography_id == Geography.id)
            & (DataSource.name == ERA5_SOURCE_NAME),
        )
        .outerjoin(ClimateRun, ClimateRun.data_source_id == DataSource.id)
        .where(Geography.slug == slug)
        .order_by(
            ClimateRun.generated_at.desc().nullslast(), ClimateRun.id.desc().nullslast()
        )
        .limit(1)
    )
    row = session.execute(stmt).mappings().first()
    if row is None:
        return None

    data_label = row["data_label"].value if row["data_label"] is not None else None
    return ClimateContext(
        slug=row["slug"],
        admin_unit_id=row["admin_unit_id"],
        last_refreshed_at=row["last_refreshed_at"],
        climate_run_id=row["climate_run_id"],
        window_start_year=row["window_start_year"],
        window_end_year=row["window_end_year"],
        data_label=data_label,
    )


def _load_monthly_tmax(
    session: Session,
    admin_unit_id: int,
    climate_run_id: int,
) -> list[tuple[date, float]]:
    rows = session.execute(
        select(DistrictClimate.period_month, DistrictClimate.value)
        .where(
            DistrictClimate.admin_unit_id == admin_unit_id,
            DistrictClimate.climate_run_id == climate_run_id,
            DistrictClimate.variable == "tmax_monthly_mean_c",
        )
        .order_by(DistrictClimate.period_month.asc())
    ).all()

    return [(row.period_month, float(row.value)) for row in rows]


def _resolve_anchor_month(
    all_months: list[tuple[date, float]], end_month: str | None
) -> str | None:
    if end_month:
        return end_month
    if not all_months:
        return None
    return _format_month(all_months[-1][0])


def _resolve_target_months(
    timeframe: Timeframe,
    all_months: list[tuple[date, float]],
    anchor_month: str | None,
    context: ClimateContext,
) -> list[str]:
    if not anchor_month:
        return []

    month_keys = [_format_month(month) for month, _ in all_months]

    if timeframe.id == "historical_window":
        if context.window_start_year and context.window_end_year:
            return [
                month
                for month in month_keys
                if context.window_start_year
                <= int(month[:4])
                <= context.window_end_year
            ]
        return month_keys

    month_count = timeframe.month_count or 0
    try:
        anchor_index = month_keys.index(anchor_month)
    except ValueError:
        return []

    start_index = max(0, anchor_index - month_count + 1)
    return month_keys[start_index : anchor_index + 1]


def _pick_series(
    all_months: list[tuple[date, float]], target_months: list[str]
) -> list[MonthValue]:
    wanted = set(target_months)
    return [
        MonthValue(month=_format_month(month), tmax_monthly_mean_c=value)
        for month, value in all_months
        if _format_month(month) in wanted
    ]


def _build_availability(
    request: PreviewRequest,
    timeframe: Timeframe,
    context: ClimateContext,
    target_months: list[str],
    series: list[MonthValue],
    now: Callable[[], datetime],
) -> Availability:
    months_requested = (
        timeframe.month_count
        if timeframe.month_count is not None
        else len(target_months)
    )
    found_months = {point.month for point in series}
    missing_months = [month for month in target_months if month not in found_months]
    months_found = len(series)

    status: AvailabilityStatus = "ready"
    if months_found == 0:
        status = "missing"
    elif missing_months:
        status = "partial"
    elif _is_stale(context.last_refreshed_at, now):
        status = "stale"

    pull_required = status in {"missing", "partial", "stale"}

    return Availability(
        location_slug=request.location_slug,
        timeframe_id=request.timeframe_id,
        status=status,
        months_requested=months_requested,
        months_found=months_found,
        missing_months=missing_months,
        period_start=series[0].month if series else None,
        period_end=series[-1].month if series else None,
        last_refreshed_at=(
            context.last_refreshed_at.isoformat() if context.last_refreshed_at else None
        ),
        climate_run_id=context.climate_run_id,
        data_label=context.data_label,
        pull_required=pull_required,
        pull_hint=(
            f"PRESET={request.location_slug} make climate-materialize"
            if pull_required
            else None
        ),
    )


def _unavailable_availability(
    request: PreviewRequest,
    timeframe: Timeframe,
    context: ClimateContext | None,
) -> Availability:
    hint = (
        "Seasonal tier not built yet. Use exposure_3m or recent_12m for observed ERA5."
        if timeframe.id == "seasonal"
        else "Projection tier not built yet. Use exposure_3m or recent_12m for observed ERA5."
    )
    return Availability(
        location_slug=request.location_slug,
        timeframe_id=request.timeframe_id,
        status="not_available",
        months_requested=timeframe.month_count or 0,
        months_found=0,
        missing_months=[],
        period_start=None,
        period_end=None,
        last_refreshed_at=(
            context.last_refreshed_at.isoformat()
            if context and context.last_refreshed_at
            else None
        ),
        climate_run_id=context.climate_run_id if context else None,
        data_label=context.data_label if context else None,
        pull_required=False,
        pull_hint=hint,
    )


def _missing_availability(
    request: PreviewRequest,
    timeframe: Timeframe,
    context: ClimateContext | None,
) -> Availability:
    return Availability(
        location_slug=request.location_slug,
        timeframe_id=request.timeframe_id,
        status="missing",
        months_requested=timeframe.month_count or 0,
        months_found=0,
        missing_months=[],
        period_start=None,
        period_end=None,
        last_refreshed_at=(
            context.last_refreshed_at.isoformat()
            if context and context.last_refreshed_at
            else None
        ),
        climate_run_id=None,
        data_label=None,
        pull_required=True,
        pull_hint=f"PRESET={request.location_slug} make climate-materialize",
    )


def _is_stale(last_refreshed_at: datetime | None, now: Callable[[], datetime]) -> bool:
    if last_refreshed_at is None:
        return True
    refreshed = (
        last_refreshed_at
        if last_refreshed_at.tzinfo
        else last_refreshed_at.replace(tzinfo=timezone.utc)
    )
    return now() - refreshed > timedelta(days=35)


def _format_month(value: date) -> str:
    return f"{value.year:04d}-{value.month:02d}"


def _location_response(location: Location) -> LocationResponse:
    return LocationResponse(
        slug=location.slug,
        name=location.name,
        country=location.country,
        level=location.level,
        supports_lbw_prediction=location.supports_lbw_prediction,
        lbw_areas=list(location.lbw_areas),
    )


def _timeframe_response(timeframe: Timeframe) -> TimeframeResponse:
    return TimeframeResponse(
        id=timeframe.id,
        label=timeframe.label,
        description=timeframe.description,
        horizon=timeframe.horizon,
        resolution=timeframe.resolution,
        month_count=timeframe.month_count,
        tier=timeframe.tier,
    )


def _call_lbw_predict(
    base_url: str,
    *,
    area: str,
    trimester: int,
    tmax_lag: list[float],
    ref: float | None,
) -> LbwPrediction:
    body: dict[str, object] = {
        "area": area,
        "trimester": trimester,
        "tmax_lag": tmax_lag,
    }
    if ref is not None:
        body["ref"] = ref

    request = urllib.request.Request(
        f"{base_url.rstrip('/')}/predict",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as error:
        raise ClimateServiceError("LBW_PREDICT_FAILED", 502) from error
    except urllib.error.URLError as error:
        raise ClimateServiceError("LBW_PREDICT_FAILED", 502) from error

    return LbwPrediction(
        area=str(payload.get("area", area)),
        geography_level=str(payload.get("geography_level", "state")),
        trimester=int(payload.get("trimester", trimester)),
        tmax_lag=[float(value) for value in payload.get("tmax_lag", tmax_lag)],
        ref_temp=float(payload["ref_temp"]),
        odds_ratio=float(payload["odds_ratio"]),
        ci95_low=float(payload["ci95_low"]),
        ci95_high=float(payload["ci95_high"]),
        on_training_support=bool(payload.get("on_training_support", False)),
        model_file=str(payload.get("model_file", "")),
    )
