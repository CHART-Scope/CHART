from __future__ import annotations

import logging
import uuid

from sqlalchemy import delete, select

from chart.auth.schemas import CurrentUserContext
from chart.auth.service import chart_roles
from chart.identity import IdentityError, disable_user as disable_identity_user
from chart.identity import upsert_user
from chart.shared.db.models import (
    AppGeography,
    AppUser,
    UserGeographyScopeRecord,
    UserRoleRecord,
)
from chart.shared.db.session import get_session_factory

from .schemas import CreateUserInput, UserGeographyScope, UserResponse

logger = logging.getLogger(__name__)


class UserServiceError(ValueError):
    def __init__(self, code: str, status_code: int) -> None:
        super().__init__(code)
        self.code = code
        self.status_code = status_code


def list_users(user: CurrentUserContext) -> list[UserResponse]:
    _require_admin(user)
    with get_session_factory()() as session:
        users = list(session.scalars(select(AppUser)))
        user_ids = [item.id for item in users]
        roles: dict[str, list[str]] = {user_id: [] for user_id in user_ids}
        for user_id, role in session.execute(
            select(UserRoleRecord.user_id, UserRoleRecord.role).where(
                UserRoleRecord.user_id.in_(user_ids)
            )
        ):
            roles[user_id].append(role)
        places: dict[str, list[AppGeography]] = {user_id: [] for user_id in user_ids}
        for user_id, place in session.execute(
            select(UserGeographyScopeRecord.user_id, AppGeography)
            .join(
                AppGeography,
                AppGeography.id == UserGeographyScopeRecord.geography_id,
            )
            .where(UserGeographyScopeRecord.user_id.in_(user_ids))
        ):
            places[user_id].append(place)
        return [_user_response(item, roles[item.id], places[item.id]) for item in users]


def create_user(input_data: CreateUserInput, actor: CurrentUserContext) -> UserResponse:
    _require_admin(actor)
    roles = list(dict.fromkeys(input_data.roles))
    if any(role not in chart_roles for role in roles):
        raise UserServiceError("USER_ROLE_INVALID", 400)
    geography_ids = list(dict.fromkeys(input_data.geographyIds))
    with get_session_factory()() as session:
        places = list(
            session.scalars(
                select(AppGeography).where(AppGeography.id.in_(geography_ids))
            )
        )
    if len(places) != len(geography_ids):
        raise UserServiceError("USER_GEOGRAPHY_INVALID", 400)
    try:
        identity = upsert_user(
            name=input_data.name.strip(),
            email=input_data.email.strip().lower(),
            username=input_data.username.strip().lower(),
            password=input_data.password,
            roles=roles,
            group_paths=[place.path for place in places],
        )
    except IdentityError as error:
        raise UserServiceError(error.code, error.status_code) from error

    persisted = False
    try:
        with get_session_factory()() as session:
            record = session.get(AppUser, identity.user_id)
            if record is None:
                record = AppUser(
                    id=identity.user_id,
                    username=identity.username,
                    display_name=input_data.name.strip(),
                )
                session.add(record)
            record.email = identity.email
            record.phone = input_data.phone.strip() if input_data.phone else None
            record.display_name = input_data.name.strip()
            record.status = "active"
            record.created_by_user_id = actor.user_id
            session.execute(
                delete(UserRoleRecord).where(UserRoleRecord.user_id == record.id)
            )
            session.execute(
                delete(UserGeographyScopeRecord).where(
                    UserGeographyScopeRecord.user_id == record.id
                )
            )
            for role in roles:
                session.add(
                    UserRoleRecord(user_id=record.id, role=role, source="admin")
                )
            for place in places:
                session.add(
                    UserGeographyScopeRecord(
                        id=f"user-geo-{uuid.uuid4()}",
                        user_id=record.id,
                        geography_id=place.id,
                        source="admin",
                        external_group_path=place.path,
                    )
                )
            session.commit()
            persisted = True
            return _response(session, record)
    except Exception as error:
        if identity.created and not persisted:
            try:
                disable_identity_user(identity.user_id)
            except IdentityError:
                logger.exception(
                    "Failed to disable orphaned identity %s", identity.user_id
                )
        raise UserServiceError("USER_PERSIST_FAILED", 500) from error


def disable_user(user_id: str, actor: CurrentUserContext) -> UserResponse:
    _require_admin(actor)
    if user_id == actor.user_id:
        raise UserServiceError("USER_CANNOT_DISABLE_SELF", 400)
    with get_session_factory()() as session:
        record = session.get(AppUser, user_id)
        if record is None:
            raise UserServiceError("USER_NOT_FOUND", 404)
    try:
        disable_identity_user(user_id)
    except IdentityError as error:
        raise UserServiceError(error.code, error.status_code) from error
    with get_session_factory()() as session:
        record = session.get(AppUser, user_id)
        assert record is not None
        record.status = "disabled"
        session.commit()
        return _response(session, record)


def _response(session, user: AppUser) -> UserResponse:
    roles = list(
        session.scalars(
            select(UserRoleRecord.role).where(UserRoleRecord.user_id == user.id)
        )
    )
    places = session.execute(
        select(AppGeography)
        .join(
            UserGeographyScopeRecord,
            UserGeographyScopeRecord.geography_id == AppGeography.id,
        )
        .where(UserGeographyScopeRecord.user_id == user.id)
    ).scalars()
    return _user_response(user, roles, list(places))


def _user_response(
    user: AppUser,
    roles: list[str],
    places: list[AppGeography],
) -> UserResponse:
    return UserResponse(
        userId=user.id,
        username=user.username,
        email=user.email,
        phone=user.phone,
        displayName=user.display_name,
        status=user.status,
        roles=roles,
        geographyScopes=[
            UserGeographyScope(
                geographyId=place.id,
                path=place.path,
                name=place.name,
                levelLabel=place.level_label,
            )
            for place in places
        ],
    )


def _require_admin(user: CurrentUserContext) -> None:
    if "chart_admin" not in user.roles:
        raise UserServiceError("USER_FORBIDDEN", 403)
