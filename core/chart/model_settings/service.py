"""Per-country model settings: which model options CHART offers.

One row per country and outcome narrows three things:

* ``selectors`` - pregnancy windows (LBW) or age groups (under-five). The
  Kenya outlook publishes ``P``/``T1``-``T3`` and the under-five age groups;
  a live LBW release scores numbered windows, offered as ``window_1``-``3``.
* ``scenarios`` - the climate scenarios offered, with one default.
* ``data_modes`` - which views are offered: ``observed`` (Copernicus ERA5
  months), ``seasonal`` (C3S forecast, up to six months ahead) and
  ``projection`` (long-term scenarios).

Settings can only switch off what the published tables or the active model
releases support: unknown codes are refused, each view keeps at least one
option, and a default must be switched on. No row means the defaults: every
option on, except LBW pregnancy windows on the outlook, where only the whole
pregnancy is on (as agreed with the modeller).

Any signed-in user who can read the country may change them for now; roles
are deliberately not restricted yet. Every change writes a
``model_settings_changed`` audit event with the values before and after.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from chart.auth.schemas import CurrentUserContext
from chart.auth.service import can_read_geography_path
from chart.climate.planning_targets import heat_season_calendar
from chart.climate.source_policy import APPROVED_PROJECTION_SCENARIOS
from chart.heat_outlook.service import (
    DEFAULT_SCENARIO,
    DEFAULT_SELECTOR,
    LBW_OUTCOME,
    OUTCOMES as OUTLOOK_OUTCOMES,
    OutlookRestriction,
    published_options,
    scenario_label,
)
from chart.shared.db.models import (
    ActiveModelAssignment,
    AdminUnit,
    AppGeography,
    AppUser,
    AuditEventRecord,
    ModelAreaMapping,
    ModelDisplaySetting,
)
from chart.shared.db.session import get_session_factory

from .schemas import (
    AvailableOptions,
    ModelSettingsListResponse,
    ModelSettingsResponse,
    ModelSettingsValues,
    OptionView,
    SettingOption,
)

logger = logging.getLogger(__name__)

OUTLOOK_COUNTRY = "KE"
PREDICTION_MODULE = "prediction"
AUDIT_EVENT_TYPE = "model_settings_changed"
WHOLE_PREGNANCY = "P"
LIVE_WINDOW_PREFIX = "window_"
# The live schema numbers windows from the end: 3 is first, 1 is final.
LIVE_WINDOW_LABELS = {
    3: "Monthly model: first window (3)",
    2: "Monthly model: middle window (2)",
    1: "Monthly model: final window (1)",
}
DATA_MODE_LABELS = {
    "observed": "Observed months (Copernicus ERA5)",
    "seasonal": "Next months (C3S seasonal forecast, up to 6 months)",
    "projection": "Long-term projections (climate scenarios)",
}
SELECTOR_LABELS = {LBW_OUTCOME: "Pregnancy windows"}


class ModelSettingsError(ValueError):
    def __init__(self, code: str, status_code: int, detail: str = "") -> None:
        super().__init__(code)
        self.code = code
        self.status_code = status_code
        self.detail = detail


@dataclass(frozen=True)
class LiveRestriction:
    """What planning requests for one place may use."""

    windows: frozenset[int]
    scenarios: frozenset[str]
    data_modes: frozenset[str]


@dataclass(frozen=True)
class _Support:
    available: AvailableOptions
    # Window codes of each live place; every place must keep one switched on.
    place_windows: tuple[frozenset[str], ...]


def get_settings(
    user: CurrentUserContext,
    country_code: str,
    outcome: str,
    *,
    session_factory=None,
) -> ModelSettingsResponse:
    country_code = country_code.upper()
    with (session_factory or get_session_factory())() as session:
        country = _require_country_access(session, user, country_code)
        support = _support(session, country_code, outcome)
        if support is None:
            raise ModelSettingsError("MODEL_SETTINGS_NOT_AVAILABLE", 404)
        return _response(session, country, outcome, support)


def list_settings(
    user: CurrentUserContext, *, session_factory=None
) -> ModelSettingsListResponse:
    """Settings for every country the user can read, one item per outcome."""

    with (session_factory or get_session_factory())() as session:
        countries = session.scalars(
            select(AppGeography)
            .where(AppGeography.level == "country")
            .order_by(AppGeography.sort_order, AppGeography.name)
        ).all()
        items = []
        for country in countries:
            if not can_read_geography_path(user, country.path):
                continue
            code = country.country_code.upper()
            for outcome in _outcomes(session, code):
                support = _support(session, code, outcome)
                if support is not None:
                    items.append(_response(session, country, outcome, support))
        return ModelSettingsListResponse(items=items)


def update_settings(
    user: CurrentUserContext,
    country_code: str,
    outcome: str,
    values: ModelSettingsValues,
    *,
    session_factory=None,
    now: datetime | None = None,
) -> ModelSettingsResponse:
    country_code = country_code.upper()
    with (session_factory or get_session_factory())() as session:
        country = _require_country_access(session, user, country_code)
        support = _support(session, country_code, outcome)
        if support is None:
            raise ModelSettingsError("MODEL_SETTINGS_NOT_AVAILABLE", 404)
        after = validate(values, support)
        row = _row(session, country_code, outcome)
        before, _ = _effective(row, support, outcome)
        _ensure_user(session, user)
        current_time = now or datetime.now(timezone.utc)
        if row is None:
            row = ModelDisplaySetting(country_code=country_code, outcome=outcome)
            session.add(row)
        row.settings = after.model_dump()
        row.updated_by_user_id = user.user_id
        row.updated_at = current_time
        session.add(
            AuditEventRecord(
                user_id=user.user_id,
                # Written by the server, so it has no browser session; a fresh
                # flush id keeps the client dedupe key unique.
                session_id="server",
                flush_id=f"model-settings-{uuid.uuid4()}",
                client_seq=0,
                event_type=AUDIT_EVENT_TYPE,
                occurred_at=current_time,
                geography_id=country.id,
                payload={
                    "country_code": country_code,
                    "outcome": outcome,
                    "before": before.model_dump(),
                    "after": after.model_dump(),
                },
            )
        )
        session.commit()
        return _response(session, country, outcome, support)


def outlook_restriction(outcome: str, *, session_factory=None) -> OutlookRestriction:
    """The Kenya outlook options left on for one outcome."""

    with (session_factory or get_session_factory())() as session:
        support = _support(session, OUTLOOK_COUNTRY, outcome)
        if support is None:
            return OutlookRestriction(frozenset(), frozenset())
        values, _ = _effective(
            _row(session, OUTLOOK_COUNTRY, outcome), support, outcome
        )
        outlook_selectors = _codes(support.available.selectors, "outlook")
        outlook_scenarios = _codes(support.available.scenarios, "outlook")
        outlook_views = _codes(support.available.data_modes, "outlook")
        return OutlookRestriction(
            selectors=frozenset(values.selectors) & frozenset(outlook_selectors),
            scenarios=frozenset(values.scenarios) & frozenset(outlook_scenarios),
            default_selector=values.default_selector,
            default_scenario=values.default_scenario,
            data_modes=frozenset(values.data_modes) & frozenset(outlook_views),
        )


def live_restriction(
    session: Session, country_code: str, outcome: str
) -> LiveRestriction | None:
    """What planning may use in a country, or None when nothing is live."""

    country_code = country_code.upper()
    support = _support(session, country_code, outcome)
    if support is None:
        return None
    values, _ = _effective(_row(session, country_code, outcome), support, outcome)
    return LiveRestriction(
        windows=frozenset(
            int(code.removeprefix(LIVE_WINDOW_PREFIX))
            for code in values.selectors
            if code.startswith(LIVE_WINDOW_PREFIX)
        ),
        scenarios=frozenset(values.scenarios),
        data_modes=frozenset(values.data_modes),
    )


def validate(values: ModelSettingsValues, support: _Support) -> ModelSettingsValues:
    """Normalise settings, refusing anything that is not a narrowing."""

    available = support.available
    selectors = _narrowed("selectors", values.selectors, available.selectors)
    if any(not windows & set(selectors) for windows in support.place_windows):
        raise ModelSettingsError(
            "MODEL_SETTINGS_OPTION_REQUIRED", 422, "selectors:live"
        )
    scenarios = _narrowed("scenarios", values.scenarios, available.scenarios)
    data_modes = _narrowed("data_modes", values.data_modes, available.data_modes)
    return ModelSettingsValues(
        selectors=selectors,
        default_selector=_default(
            "default_selector", values.default_selector, selectors, available.selectors
        ),
        scenarios=scenarios,
        default_scenario=_default(
            "default_scenario", values.default_scenario, scenarios, available.scenarios
        ),
        data_modes=data_modes,
    )


def default_settings(support: _Support, outcome: str) -> ModelSettingsValues:
    available = support.available
    selectors = [option.code for option in available.selectors]
    outlook_selectors = _codes(available.selectors, "outlook")
    if outcome == LBW_OUTCOME and WHOLE_PREGNANCY in outlook_selectors:
        # Trimesters on the outlook are hidden until someone turns them on.
        selectors = [
            code
            for code in selectors
            if code == WHOLE_PREGNANCY or code not in outlook_selectors
        ]
    scenarios = [option.code for option in available.scenarios]
    return ModelSettingsValues(
        selectors=selectors,
        default_selector=_preferred(
            DEFAULT_SELECTOR.get(outcome),
            [code for code in outlook_selectors if code in selectors],
        ),
        scenarios=scenarios,
        default_scenario=_preferred(
            DEFAULT_SCENARIO,
            _codes(available.scenarios, "outlook") or scenarios,
        ),
        data_modes=[option.code for option in available.data_modes],
    )


def _effective(
    row: ModelDisplaySetting | None, support: _Support, outcome: str
) -> tuple[ModelSettingsValues, bool]:
    """The stored settings, or the defaults when none (or none still valid).

    A code a newer release no longer offers is dropped. If what remains no
    longer satisfies the rules, the defaults apply until someone saves again.
    """

    if row is None:
        return default_settings(support, outcome), True
    available = support.available
    stored = dict(row.settings or {})
    known = {
        "selectors": {option.code for option in available.selectors},
        "scenarios": {option.code for option in available.scenarios},
        "data_modes": {option.code for option in available.data_modes},
    }
    for key, codes in known.items():
        stored[key] = [code for code in stored.get(key) or [] if code in codes]
    try:
        return validate(ModelSettingsValues.model_validate(stored), support), False
    except (ModelSettingsError, ValueError):
        logger.warning(
            "model_settings: stored %s/%s no longer valid; using defaults",
            row.country_code,
            row.outcome,
        )
        return default_settings(support, outcome), True


def _narrowed(
    field: str, enabled: list[str], options: list[SettingOption]
) -> list[str]:
    known = {option.code for option in options}
    unknown = [code for code in enabled if code not in known]
    if unknown:
        raise ModelSettingsError(
            "MODEL_SETTINGS_OPTION_UNKNOWN", 422, f"{field}:{','.join(unknown)}"
        )
    chosen = set(enabled)
    for view in sorted({view for option in options for view in option.views}):
        if not chosen & set(_codes(options, view)):
            raise ModelSettingsError(
                "MODEL_SETTINGS_OPTION_REQUIRED", 422, f"{field}:{view}"
            )
    return [option.code for option in options if option.code in chosen]


def _default(
    field: str,
    default: str | None,
    enabled: list[str],
    options: list[SettingOption],
) -> str | None:
    """A default must be on and, where the outlook uses it, an outlook option."""

    outlook = _codes(options, "outlook")
    if default is None:
        if outlook:
            raise ModelSettingsError("MODEL_SETTINGS_DEFAULT_REQUIRED", 422, field)
        return None
    if default not in enabled or (outlook and default not in outlook):
        raise ModelSettingsError("MODEL_SETTINGS_DEFAULT_NOT_ENABLED", 422, field)
    return default


def _support(session: Session, country_code: str, outcome: str) -> _Support | None:
    """What the outlook tables and the live releases offer, or None."""

    selectors: dict[str, SettingOption] = {}
    scenarios: dict[str, SettingOption] = {}
    data_modes: dict[str, SettingOption] = {}

    def offer(
        target: dict[str, SettingOption], code: str, label: str, view: OptionView
    ) -> None:
        option = target.setdefault(
            code, SettingOption(code=code, label=label, views=[])
        )
        if view not in option.views:
            option.views.append(view)

    published = (
        published_options(outcome)
        if country_code == OUTLOOK_COUNTRY and outcome in OUTLOOK_OUTCOMES
        else None
    )
    if published is not None:
        for selector in published.selectors:
            label = selector.label
            offer(selectors, selector.code, label, "outlook")
        for code in published.scenarios:
            offer(scenarios, code, scenario_label(code), "outlook")
        if published.observed:
            offer(data_modes, "observed", DATA_MODE_LABELS["observed"], "outlook")
        if published.scenarios:
            offer(data_modes, "projection", DATA_MODE_LABELS["projection"], "outlook")

    places = _live_places(session, country_code, outcome)
    place_windows: list[frozenset[str]] = []
    if places:
        windows = sorted(
            {window for place_windows_, _ in places for window in place_windows_},
            reverse=True,
        )
        for window in windows:
            offer(
                selectors,
                f"{LIVE_WINDOW_PREFIX}{window}",
                LIVE_WINDOW_LABELS[window],
                "live",
            )
        place_windows = [
            frozenset(f"{LIVE_WINDOW_PREFIX}{window}" for window in place)
            for place, _ in places
            if place
        ]
        offer(data_modes, "observed", DATA_MODE_LABELS["observed"], "live")
        offer(data_modes, "seasonal", DATA_MODE_LABELS["seasonal"], "live")
        if any(has_calendar for _, has_calendar in places):
            offer(data_modes, "projection", DATA_MODE_LABELS["projection"], "live")
            for code in sorted(APPROVED_PROJECTION_SCENARIOS):
                offer(scenarios, code, scenario_label(code), "live")

    if published is None and not places:
        return None
    order = list(DATA_MODE_LABELS)
    return _Support(
        available=AvailableOptions(
            selector_label=SELECTOR_LABELS.get(outcome, "Age groups"),
            selectors=list(selectors.values()),
            scenarios=sorted(scenarios.values(), key=lambda option: option.code),
            data_modes=sorted(
                data_modes.values(), key=lambda option: order.index(option.code)
            ),
        ),
        place_windows=tuple(place_windows),
    )


def _live_places(
    session: Session, country_code: str, outcome: str
) -> list[tuple[tuple[int, ...], bool]]:
    """Each live place's validated windows and whether it has a hot season."""

    rows = session.execute(
        select(
            ModelAreaMapping.validated_pregnancy_windows,
            AdminUnit.code,
            AppGeography.path,
        )
        .join(
            ActiveModelAssignment,
            (
                ActiveModelAssignment.model_release_id
                == ModelAreaMapping.model_release_id
            )
            & (ActiveModelAssignment.admin_unit_id == ModelAreaMapping.admin_unit_id),
        )
        .join(AdminUnit, AdminUnit.id == ModelAreaMapping.admin_unit_id)
        .join(AppGeography, AppGeography.id == AdminUnit.app_geography_id)
        .where(
            ActiveModelAssignment.module == PREDICTION_MODULE,
            ActiveModelAssignment.outcome == outcome,
            AppGeography.country_code == country_code,
        )
    ).all()
    return [
        (
            tuple(
                window
                for window in (windows or ())
                if type(window) is int and window in LIVE_WINDOW_LABELS
            ),
            heat_season_calendar(code, path) is not None,
        )
        for windows, code, path in rows
    ]


def _outcomes(session: Session, country_code: str) -> list[str]:
    live = session.scalars(
        select(ActiveModelAssignment.outcome)
        .join(AdminUnit, AdminUnit.id == ActiveModelAssignment.admin_unit_id)
        .join(AppGeography, AppGeography.id == AdminUnit.app_geography_id)
        .where(
            ActiveModelAssignment.module == PREDICTION_MODULE,
            AppGeography.country_code == country_code,
        )
        .distinct()
    ).all()
    outlook = OUTLOOK_OUTCOMES if country_code == OUTLOOK_COUNTRY else ()
    return sorted({*live, *outlook})


def _require_country_access(
    session: Session, user: CurrentUserContext, country_code: str
) -> AppGeography:
    country = session.scalar(
        select(AppGeography).where(
            AppGeography.country_code == country_code,
            AppGeography.level == "country",
        )
    )
    if country is None:
        raise ModelSettingsError("MODEL_SETTINGS_NOT_AVAILABLE", 404)
    if not can_read_geography_path(user, country.path):
        raise ModelSettingsError("GEOGRAPHY_OUT_OF_SCOPE", 403)
    return country


def _response(
    session: Session, country: AppGeography, outcome: str, support: _Support
) -> ModelSettingsResponse:
    country_code = country.country_code.upper()
    row = _row(session, country_code, outcome)
    values, is_default = _effective(row, support, outcome)
    return ModelSettingsResponse(
        country_code=country_code,
        country_name=country.name,
        outcome=outcome,
        available=support.available,
        settings=values,
        is_default=is_default,
        updated_by_user_id=row.updated_by_user_id if row else None,
        updated_at=row.updated_at if row else None,
    )


def _row(
    session: Session, country_code: str, outcome: str
) -> ModelDisplaySetting | None:
    return session.scalar(
        select(ModelDisplaySetting).where(
            ModelDisplaySetting.country_code == country_code,
            ModelDisplaySetting.outcome == outcome,
        )
    )


def _ensure_user(session: Session, user: CurrentUserContext) -> None:
    """The audit row needs the user; a first-time caller has none yet."""

    if session.get(AppUser, user.user_id) is None:
        session.add(
            AppUser(
                id=user.user_id,
                username=user.username,
                email=user.email,
                display_name=user.username,
                status="active",
            )
        )
        session.flush()


def _codes(options: list[SettingOption], view: OptionView) -> list[str]:
    return [option.code for option in options if view in option.views]


def _preferred(code: str | None, codes: list[str]) -> str | None:
    if code in codes:
        return code
    return codes[0] if codes else None
