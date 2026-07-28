from __future__ import annotations

import json
import hashlib
import os
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError

from chart.auth.schemas import CurrentUserContext
from chart.identity import IdentityError, upsert_user
from chart.shared.db.models import (
    AppGeography,
    AppUser,
    CountryGeoConfig,
    SetupStateRecord,
    UserGeographyScopeRecord,
    UserRoleRecord,
    WorkspaceMemberRecord,
    WorkspaceRecord,
)
from chart.shared.db.session import get_session_factory

from .schemas import (
    BootstrapAdminResponse,
    BootstrapSetupInput,
    BootstrapSetupResponse,
    CompleteSetupInput,
    HazardOption,
    SetupCounts,
    SetupOptions,
    SetupStatus,
)

SETUP_ID = "default"
REPO_ROOT = Path(__file__).resolve().parents[3]


class SetupError(ValueError):
    def __init__(self, code: str, status_code: int) -> None:
        super().__init__(code)
        self.code = code
        self.status_code = status_code


def get_status(*, session_factory=None) -> SetupStatus:
    session_factory = session_factory or get_session_factory()
    with session_factory() as session:
        state = session.get(SetupStateRecord, SETUP_ID)
        geography_count = (
            session.scalar(select(func.count()).select_from(AppGeography)) or 0
        )
        member_count = (
            session.scalar(select(func.count()).select_from(WorkspaceMemberRecord)) or 0
        )
        complete = bool(state and state.completed and geography_count and member_count)
        return SetupStatus(
            completed=complete,
            requiresOnboarding=not complete,
            phase=state.phase if state else "uninitialized",
            countryCode=state.country_code if state else None,
            countryName=state.country_name if state else None,
            rootGeographyId=state.root_geography_id if state else None,
            firstAdminUserId=state.first_admin_user_id if state else None,
            selectedHazards=state.selected_hazards if state else [],
            counts=SetupCounts(
                geographies=int(geography_count), workspaceMembers=int(member_count)
            ),
        )


def get_options() -> SetupOptions:
    return SetupOptions(hazards=_hazards())


def bootstrap(
    input_data: BootstrapSetupInput, *, session_factory=None
) -> BootstrapSetupResponse:
    session_factory = session_factory or get_session_factory()
    operation_id = _claim_bootstrap(input_data, session_factory)
    paths = [row.path for row in input_data.geographies] or [
        f"/{_slug(input_data.countryName)}"
    ]
    try:
        identity = upsert_user(
            name=input_data.admin.name.strip(),
            email=input_data.admin.email.strip().lower(),
            username=input_data.admin.username.strip().lower(),
            password=input_data.admin.password,
            roles=["chart_admin", "content_editor"],
            group_paths=list(dict.fromkeys(paths)),
            operation_id=operation_id,
        )
    except IdentityError as error:
        _mark_bootstrap_failed(
            operation_id,
            error.code.replace("USER_", "SETUP_"),
            session_factory,
        )
        raise SetupError(
            error.code.replace("USER_", "SETUP_"), error.status_code
        ) from error
    user = CurrentUserContext(
        userId=identity.user_id,
        username=identity.username,
        email=identity.email,
        roles=["chart_admin", "content_editor"],
        geographyScopes=paths,
        activeGeographyId=paths[0],
        geographyLevel=(
            input_data.geographies[0].level if input_data.geographies else "country"
        ),
    )
    try:
        result = complete(
            input_data,
            user,
            session_factory=session_factory,
            provisioning_token=operation_id,
        )
    except Exception as error:
        _mark_bootstrap_failed(
            operation_id,
            getattr(error, "code", type(error).__name__),
            session_factory,
        )
        raise
    return BootstrapSetupResponse(
        setup=result,
        admin=BootstrapAdminResponse(
            userId=identity.user_id,
            username=identity.username,
            email=identity.email,
        ),
    )


def complete(
    input_data: CompleteSetupInput,
    user: CurrentUserContext,
    *,
    session_factory=None,
    provisioning_token: str | None = None,
) -> SetupStatus:
    if "chart_admin" not in user.roles:
        raise SetupError("SETUP_FORBIDDEN", 403)
    selected = _selected_hazards(input_data.hazardIds)
    country_code = input_data.countryCode.strip().upper()
    root_id = f"geo-{country_code.lower()}"
    root_path = f"/{_slug(input_data.countryName)}"
    session_factory = session_factory or get_session_factory()
    with session_factory() as session:
        state = session.get(SetupStateRecord, SETUP_ID, with_for_update=True)
        if state is None:
            state = SetupStateRecord(id=SETUP_ID)
            session.add(state)
            session.flush()
        if provisioning_token is not None:
            if (
                state.phase != "provisioning"
                or state.provisioning_token != provisioning_token
            ):
                raise SetupError("SETUP_PROVISIONING_LOST", 409)
        elif state.phase == "provisioning":
            raise SetupError("SETUP_BOOTSTRAP_IN_PROGRESS", 409)

        labels = {"country": "Country", "geo_level_1": input_data.geographyLevelLabel}
        labels.update({row.level: row.levelLabel for row in input_data.geographies})
        for index, (level, label) in enumerate(labels.items()):
            config = session.get(CountryGeoConfig, (country_code, level))
            if config is None:
                config = CountryGeoConfig(country_code=country_code, level_key=level)
                session.add(config)
            config.level_label = label
            config.enabled = True
            config.sort_order = index * 10
        session.flush()
        _upsert_place(
            session,
            root_id,
            country_code,
            "country",
            "Country",
            input_data.countryName.strip(),
            None,
            root_path,
            0,
        )
        level_order = {
            "country": 0,
            "geo_level_1": 1,
            "geo_level_2": 2,
            "geo_level_3": 3,
        }
        for row in sorted(
            input_data.geographies, key=lambda item: level_order[item.level]
        ):
            _upsert_place(
                session,
                row.id,
                country_code,
                row.level,
                row.levelLabel,
                row.name,
                row.parentId or root_id,
                row.path,
                row.sortOrder,
            )
        session.flush()
        scopes = input_data.geographies or []
        _persist_user(
            session,
            user,
            [row.id for row in scopes] or [root_id],
        )
        workspace_id = f"workspace-{country_code.lower()}-default"
        workspace = session.get(WorkspaceRecord, workspace_id)
        if workspace is None:
            workspace = WorkspaceRecord(id=workspace_id)
            session.add(workspace)
        workspace.name = f"{input_data.countryName.strip()} CHART setup"
        workspace.planning_cycle = str(__import__("datetime").date.today().year)
        workspace.status = "active"
        workspace.geography_id = scopes[-1].id if scopes else root_id
        workspace.created_by_user_id = user.user_id
        workspace.owner_user_id = user.user_id
        session.flush()
        member = session.scalar(
            select(WorkspaceMemberRecord).where(
                WorkspaceMemberRecord.workspace_id == workspace.id,
                WorkspaceMemberRecord.user_id == user.user_id,
            )
        )
        if member is None:
            session.add(
                WorkspaceMemberRecord(
                    id=f"member-{uuid.uuid4()}",
                    workspace_id=workspace.id,
                    user_id=user.user_id,
                    role="owner",
                )
            )
        state.completed = True
        state.phase = "complete"
        state.provisioning_token = None
        state.provisioning_request_hash = None
        state.provisioning_started_at = None
        state.last_error_code = None
        state.country_code = country_code
        state.country_name = input_data.countryName.strip()
        state.root_geography_id = root_id
        state.first_admin_user_id = user.user_id
        state.first_admin_email = user.email
        state.selected_hazards = [item.model_dump() for item in selected]
        session.commit()
    return get_status(session_factory=session_factory)


def reset(user: CurrentUserContext) -> SetupStatus:
    if "chart_admin" not in user.roles:
        raise SetupError("SETUP_FORBIDDEN", 403)
    with get_session_factory()() as session:
        session.execute(delete(WorkspaceMemberRecord))
        session.execute(delete(WorkspaceRecord))
        state = session.get(SetupStateRecord, SETUP_ID)
        if state is None:
            state = SetupStateRecord(id=SETUP_ID)
            session.add(state)
        state.completed = False
        state.phase = "requires_admin"
        state.provisioning_token = None
        state.provisioning_request_hash = None
        state.provisioning_started_at = None
        state.selected_hazards = []
        session.commit()
    return get_status()


def _claim_bootstrap(input_data, session_factory) -> str:
    request_hash = hashlib.sha256(
        json.dumps(
            input_data.model_dump(mode="json"),
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()
    now = datetime.now(timezone.utc)

    with session_factory() as session:
        if session.get(SetupStateRecord, SETUP_ID) is None:
            session.add(SetupStateRecord(id=SETUP_ID))
            try:
                session.commit()
            except IntegrityError:
                session.rollback()

    with session_factory() as session:
        state = session.get(SetupStateRecord, SETUP_ID, with_for_update=True)
        assert state is not None
        member_count = (
            session.scalar(select(func.count()).select_from(WorkspaceMemberRecord)) or 0
        )
        if state.completed or member_count or state.phase == "requires_admin":
            raise SetupError("SETUP_BOOTSTRAP_LOCKED", 409)

        if state.phase in {"provisioning", "failed"}:
            if state.provisioning_request_hash != request_hash:
                raise SetupError("SETUP_BOOTSTRAP_REQUEST_MISMATCH", 409)
            if (
                state.phase == "provisioning"
                and state.provisioning_started_at is not None
                and _aware(state.provisioning_started_at)
                + timedelta(
                    seconds=int(os.getenv("SETUP_PROVISIONING_TIMEOUT_SECONDS", "600"))
                )
                > now
            ):
                raise SetupError("SETUP_BOOTSTRAP_IN_PROGRESS", 409)
            operation_id = state.provisioning_token or secrets.token_hex(24)
        else:
            operation_id = secrets.token_hex(24)

        state.phase = "provisioning"
        state.provisioning_token = operation_id
        state.provisioning_request_hash = request_hash
        state.provisioning_started_at = now
        state.last_error_code = None
        session.commit()
        return operation_id


def _mark_bootstrap_failed(operation_id: str, error_code: str, session_factory) -> None:
    with session_factory() as session:
        state = session.get(SetupStateRecord, SETUP_ID, with_for_update=True)
        if state is None or state.completed or state.provisioning_token != operation_id:
            return
        state.phase = "failed"
        state.last_error_code = error_code[:128]
        session.commit()


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def _persist_user(session, user, geography_ids):
    record = session.get(AppUser, user.user_id)
    if record is None:
        record = AppUser(
            id=user.user_id, username=user.username, display_name=user.username
        )
        session.add(record)
    record.email = user.email
    record.status = "active"
    session.execute(
        delete(UserRoleRecord).where(UserRoleRecord.user_id == user.user_id)
    )
    session.execute(
        delete(UserGeographyScopeRecord).where(
            UserGeographyScopeRecord.user_id == user.user_id
        )
    )
    for role in user.roles:
        session.add(
            UserRoleRecord(user_id=user.user_id, role=role, source="onboarding")
        )
    for geography_id in geography_ids:
        geography = session.get(AppGeography, geography_id)
        if geography:
            session.add(
                UserGeographyScopeRecord(
                    id=f"user-geo-{uuid.uuid4()}",
                    user_id=user.user_id,
                    geography_id=geography_id,
                    source="onboarding",
                    external_group_path=geography.path,
                )
            )


def _upsert_place(session, place_id, country, level, label, name, parent, path, order):
    place = session.get(AppGeography, place_id)
    if place is None:
        place = AppGeography(id=place_id)
        session.add(place)
    place.country_code = country
    place.level = level
    place.level_label = label
    place.name = name
    place.parent_id = parent
    place.path = path
    place.sort_order = order


def _hazards() -> list[HazardOption]:
    path = REPO_ROOT / "api/src/services/chart-repository/seed-data/seed.json"
    if not path.is_file():
        return [HazardOption(id="hazard-extreme-heat", label="Extreme heat")]
    seed = json.loads(path.read_text(encoding="utf-8"))
    labels = sorted(
        {
            label
            for item in seed.get("items", [])
            for label in item.get("climateHazards", [])
        }
    )
    return [HazardOption(id=f"hazard-{_slug(label)}", label=label) for label in labels]


def _selected_hazards(ids: list[str]) -> list[HazardOption]:
    options = {item.id: item for item in _hazards()}
    if not ids:
        raise SetupError("SETUP_HAZARD_REQUIRED", 400)
    if any(item not in options for item in ids):
        raise SetupError("SETUP_HAZARD_INVALID", 400)
    return [options[item] for item in dict.fromkeys(ids)]


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
