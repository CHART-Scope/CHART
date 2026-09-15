from __future__ import annotations

import hashlib
import json
import math
from dataclasses import asdict, dataclass, replace
from datetime import date, datetime, timezone
from typing import Literal, Mapping, NoReturn, Sequence

CLIMATE_CONTRACT_VERSION = "climate-monthly-v1"
TMAX_MONTHLY_MEAN_VARIABLE = "tmax_monthly_mean_c"
CELSIUS_UNIT = "degC"

ClimateSourceClass = Literal["observed", "near_term", "seasonal", "projection"]
ClimateDataLabel = Literal["observed", "reanalysis", "forecast", "projection", "sample"]
ClimateQualityStatus = Literal["validated", "provisional", "sample"]
ClimateFreshnessStatus = Literal["current", "stale", "not_applicable"]

_SUPPORTED_CALENDARS = {
    "gregorian",
    "proleptic_gregorian",
    "360_day",
    "365_day",
    "noleap",
}
_QUALITY_STATUSES = {"validated", "provisional", "sample"}
_FRESHNESS_STATUSES = {"current", "stale", "not_applicable"}
_ALLOWED_LABELS: dict[str, set[str]] = {
    "observed": {"observed", "reanalysis", "sample"},
    "near_term": {"forecast", "sample"},
    "seasonal": {"forecast", "sample"},
    "projection": {"projection", "sample"},
}


class ClimateDataContractError(ValueError):
    """Stable climate-data validation failure used by every source adapter."""

    def __init__(self, code: str, detail: str) -> None:
        super().__init__(f"{code}: {detail}")
        self.code = code
        self.detail = detail


@dataclass(frozen=True)
class MonthlyClimateRecord:
    """Canonical, source-neutral monthly temperature record."""

    period_month: date
    value: float
    admin_unit_code: str
    admin_unit_level: str
    boundary_version: str
    aggregation_method: str
    source_class: ClimateSourceClass
    source_name: str
    source_version: str
    source_uri: str
    source_license: str
    source_calendar: str
    data_label: ClimateDataLabel
    quality_status: ClimateQualityStatus
    freshness_status: ClimateFreshnessStatus
    generated_at: datetime
    valid_from: date
    valid_to: date
    issue_time: datetime | None = None
    ensemble_member: str | None = None
    scenario: str | None = None
    bias_adjustment: str | None = None
    downscaling_method: str | None = None
    fresh_until: datetime | None = None
    variable: str = TMAX_MONTHLY_MEAN_VARIABLE
    unit: str = CELSIUS_UNIT
    contract_version: str = CLIMATE_CONTRACT_VERSION

    @property
    def record_hash(self) -> str:
        return _hash_payload(_record_payload(self))


@dataclass(frozen=True)
class ClimateInputWindow:
    """Exactly three consecutive monthly records, newest month first."""

    records: tuple[MonthlyClimateRecord, MonthlyClimateRecord, MonthlyClimateRecord]
    input_hash: str
    contract_version: str = CLIMATE_CONTRACT_VERSION

    @property
    def tmax_lag(self) -> tuple[float, float, float]:
        return tuple(record.value for record in self.records)  # type: ignore[return-value]


def validate_monthly_record(
    record: MonthlyClimateRecord,
    *,
    live: bool = False,
    now: datetime | None = None,
) -> MonthlyClimateRecord:
    """Validate one adapter record without importing a model or orchestration code."""

    if record.contract_version != CLIMATE_CONTRACT_VERSION:
        _fail("CLIMATE_CONTRACT_VERSION_UNSUPPORTED", record.contract_version)
    if record.variable != TMAX_MONTHLY_MEAN_VARIABLE:
        _fail("CLIMATE_VARIABLE_INVALID", record.variable)
    if record.unit != CELSIUS_UNIT:
        _fail("CLIMATE_UNIT_INVALID", record.unit)
    if record.period_month.day != 1:
        _fail("CLIMATE_PERIOD_MONTH_INVALID", record.period_month.isoformat())
    if not math.isfinite(record.value):
        _fail("CLIMATE_VALUE_INVALID", repr(record.value))
    if record.source_calendar not in _SUPPORTED_CALENDARS:
        _fail("CLIMATE_CALENDAR_UNSUPPORTED", record.source_calendar)
    if record.valid_from > record.valid_to:
        _fail("CLIMATE_VALID_TIME_INVALID", "valid_from is after valid_to")
    if not (record.valid_from <= record.period_month <= record.valid_to):
        _fail("CLIMATE_PERIOD_OUTSIDE_VALID_TIME", record.period_month.isoformat())

    _require_text(record.admin_unit_code, "CLIMATE_ADMIN_UNIT_REQUIRED")
    _require_text(record.admin_unit_level, "CLIMATE_ADMIN_LEVEL_REQUIRED")
    _require_text(record.boundary_version, "CLIMATE_BOUNDARY_VERSION_REQUIRED")
    _require_text(record.aggregation_method, "CLIMATE_AGGREGATION_REQUIRED")
    _require_text(record.source_name, "CLIMATE_SOURCE_NAME_REQUIRED")
    _require_text(record.source_version, "CLIMATE_SOURCE_VERSION_REQUIRED")
    _require_text(record.source_uri, "CLIMATE_SOURCE_URI_REQUIRED")
    _require_text(record.source_license, "CLIMATE_SOURCE_LICENSE_REQUIRED")
    _require_aware(record.generated_at, "CLIMATE_GENERATED_AT_INVALID")

    allowed_labels = _ALLOWED_LABELS.get(record.source_class)
    if allowed_labels is None:
        _fail("CLIMATE_SOURCE_CLASS_INVALID", record.source_class)
    if record.data_label not in allowed_labels:
        _fail(
            "CLIMATE_DATA_LABEL_INVALID",
            f"{record.data_label} is not valid for {record.source_class}",
        )
    if record.quality_status not in _QUALITY_STATUSES:
        _fail("CLIMATE_QUALITY_STATUS_INVALID", record.quality_status)
    if record.freshness_status not in _FRESHNESS_STATUSES:
        _fail("CLIMATE_FRESHNESS_STATUS_INVALID", record.freshness_status)
    if (record.data_label == "sample") != (record.quality_status == "sample"):
        _fail(
            "CLIMATE_SAMPLE_LABEL_MISMATCH",
            "sample label and quality status must be set together",
        )

    if record.source_class in {"near_term", "seasonal"}:
        if record.issue_time is None:
            _fail("CLIMATE_ISSUE_TIME_REQUIRED", record.source_class)
        _require_aware(record.issue_time, "CLIMATE_ISSUE_TIME_INVALID")
        _require_text(record.ensemble_member, "CLIMATE_ENSEMBLE_MEMBER_REQUIRED")

    if record.source_class == "projection":
        _require_text(record.scenario, "CLIMATE_SCENARIO_REQUIRED")
        _require_text(record.ensemble_member, "CLIMATE_MODEL_MEMBER_REQUIRED")
        _require_text(record.bias_adjustment, "CLIMATE_BIAS_ADJUSTMENT_REQUIRED")
        _require_text(record.downscaling_method, "CLIMATE_DOWNSCALING_REQUIRED")
        if record.freshness_status != "not_applicable":
            _fail(
                "CLIMATE_PROJECTION_FRESHNESS_INVALID",
                "projection freshness must be not_applicable",
            )
    elif record.freshness_status == "not_applicable":
        _fail(
            "CLIMATE_FRESHNESS_INVALID",
            "only projections may use not_applicable freshness",
        )
    elif record.fresh_until is None:
        _fail("CLIMATE_FRESH_UNTIL_REQUIRED", record.source_class)

    if record.issue_time is not None:
        _require_aware(record.issue_time, "CLIMATE_ISSUE_TIME_INVALID")
    if record.fresh_until is not None:
        _require_aware(record.fresh_until, "CLIMATE_FRESH_UNTIL_INVALID")

    if live:
        if record.data_label == "sample" or record.quality_status == "sample":
            _fail("CLIMATE_SAMPLE_NOT_LIVE", record.source_name)
        if record.freshness_status == "stale":
            _fail("CLIMATE_DATA_STALE", record.period_month.isoformat())
        current_time = now or datetime.now(timezone.utc)
        _require_aware(current_time, "CLIMATE_NOW_INVALID")
        if record.fresh_until is not None and current_time > record.fresh_until:
            _fail("CLIMATE_DATA_STALE", record.period_month.isoformat())

    return record


def build_climate_input_window(
    records: Sequence[MonthlyClimateRecord],
    *,
    live: bool = False,
    now: datetime | None = None,
) -> ClimateInputWindow:
    """Build the model-shaped input without calling or importing the model."""

    if len(records) != 3:
        _fail("CLIMATE_WINDOW_SIZE_INVALID", f"expected 3 months, got {len(records)}")

    validated = tuple(
        validate_monthly_record(record, live=live, now=now) for record in records
    )
    newest_first = tuple(
        sorted(validated, key=lambda item: item.period_month, reverse=True)
    )
    if validated != newest_first:
        _fail("CLIMATE_WINDOW_ORDER_INVALID", "months must be newest to oldest")

    month_keys = [record.period_month for record in validated]
    if len(set(month_keys)) != 3:
        _fail("CLIMATE_WINDOW_DUPLICATE_MONTH", "months must be unique")
    if month_keys[1] != _previous_month(month_keys[0]) or month_keys[
        2
    ] != _previous_month(month_keys[1]):
        _fail("CLIMATE_WINDOW_GAP", "months must be consecutive")

    first = validated[0]
    for record in validated[1:]:
        if (
            record.admin_unit_code,
            record.admin_unit_level,
            record.boundary_version,
            record.aggregation_method,
            record.variable,
            record.unit,
        ) != (
            first.admin_unit_code,
            first.admin_unit_level,
            first.boundary_version,
            first.aggregation_method,
            first.variable,
            first.unit,
        ):
            _fail(
                "CLIMATE_WINDOW_GRAIN_MISMATCH",
                "all months must use the same geography and aggregation grain",
            )

    payload = {
        "contract_version": CLIMATE_CONTRACT_VERSION,
        "records": [_record_payload(record) for record in validated],
    }
    return ClimateInputWindow(
        records=validated,  # type: ignore[arg-type]
        input_hash=_hash_payload(payload),
    )


def with_freshness(
    record: MonthlyClimateRecord,
    *,
    status: ClimateFreshnessStatus,
    fresh_until: datetime | None = None,
) -> MonthlyClimateRecord:
    """Return a copy when an adapter refresh check changes freshness metadata."""

    return replace(record, freshness_status=status, fresh_until=fresh_until)


def _record_payload(record: MonthlyClimateRecord) -> dict[str, object]:
    payload = asdict(record)
    return {key: _json_value(value) for key, value in payload.items()}


def _json_value(value):
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def _hash_payload(payload: Mapping[str, object]) -> str:
    encoded = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _previous_month(value: date) -> date:
    if value.month == 1:
        return date(value.year - 1, 12, 1)
    return date(value.year, value.month - 1, 1)


def _require_text(value: str | None, code: str) -> None:
    if value is None or not value.strip():
        _fail(code, "value must not be empty")


def _require_aware(value: datetime | None, code: str) -> None:
    if value is None or value.tzinfo is None or value.utcoffset() is None:
        _fail(code, "timezone-aware timestamp required")


def _fail(code: str, detail: str) -> NoReturn:
    raise ClimateDataContractError(code, detail)
