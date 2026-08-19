from __future__ import annotations

import os
from collections.abc import Collection
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Annotated

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from jwt.exceptions import PyJWKClientError, PyJWTError

from .schemas import CurrentUserContext

chart_roles = (
    "chart_admin",
    "content_editor",
    "health_planning_lead",
    "cross_sector_planning_lead",
    "health_implementation_officer",
    "cross_sector_implementation_officer",
    "public_viewer",
)
legacy_role_aliases = {
    "u1_health_lead": "health_planning_lead",
    "u2_cross_sector_lead": "cross_sector_planning_lead",
    "u3_district_health_officer": "health_implementation_officer",
    "u4_district_cross_sector_officer": "cross_sector_implementation_officer",
    "u5_public_visitor": "public_viewer",
}
geography_levels = ("country", "geo_level_1", "geo_level_2", "geo_level_3")


@dataclass(frozen=True)
class AuthConfig:
    issuer_url: str
    client_id: str
    jwks_url: str
    clock_skew_seconds: int
    jwks_timeout_seconds: float


bearer_auth = HTTPBearer(
    auto_error=False,
    scheme_name="bearerAuth",
    description="Keycloak access token",
)


def get_auth_config() -> AuthConfig:
    issuer_url = os.getenv(
        "KEYCLOAK_ISSUER_URL", "http://127.0.0.1:8080/realms/chart"
    ).rstrip("/")
    try:
        clock_skew_seconds = int(os.getenv("KEYCLOAK_CLOCK_SKEW_SECONDS", "30"))
        jwks_timeout_seconds = float(os.getenv("KEYCLOAK_JWKS_TIMEOUT_SECONDS", "5"))
    except ValueError as error:
        raise _auth_error("AUTH_CONFIG_INVALID", 500) from error
    client_id = os.getenv("KEYCLOAK_CLIENT_ID", "chart-api")
    if (
        not issuer_url
        or not client_id
        or clock_skew_seconds < 0
        or jwks_timeout_seconds <= 0
    ):
        raise _auth_error("AUTH_CONFIG_INVALID", 500)
    return AuthConfig(
        issuer_url=issuer_url,
        client_id=client_id,
        jwks_url=os.getenv(
            "KEYCLOAK_JWKS_URL",
            f"{issuer_url}/protocol/openid-connect/certs",
        ),
        clock_skew_seconds=clock_skew_seconds,
        jwks_timeout_seconds=jwks_timeout_seconds,
    )


def require_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_auth)],
) -> CurrentUserContext:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _auth_error("AUTH_TOKEN_REQUIRED", 401)
    return verify_keycloak_token(credentials.credentials, get_auth_config())


def verify_keycloak_token(token: str, config: AuthConfig) -> CurrentUserContext:
    try:
        key = _get_signing_key(config.jwks_url, config.jwks_timeout_seconds, token)
        claims = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            issuer=config.issuer_url,
            audience=config.client_id,
            leeway=config.clock_skew_seconds,
        )
    except (OSError, PyJWKClientError, PyJWTError, ValueError) as error:
        raise _auth_error("AUTH_TOKEN_INVALID", 401) from error
    return _map_claims(claims, config.client_id)


def apply_active_geography(
    user: CurrentUserContext, active_geography_id: str | None
) -> CurrentUserContext:
    if active_geography_id is None:
        return user
    if not can_read_geography_path(user, active_geography_id):
        raise _auth_error("ACTIVE_GEOGRAPHY_OUT_OF_SCOPE", 403)
    normalized = _normalize_geography_path(active_geography_id)
    return user.model_copy(
        update={
            "active_geography_id": normalized,
            "geography_level": _infer_geography_level(normalized),
        }
    )


def can_read_geography_path(user: CurrentUserContext, requested_path: str) -> bool:
    requested = _normalize_geography_path(requested_path)
    return any(
        requested == scope or requested.startswith(f"{scope}/")
        for scope in map(_normalize_geography_path, user.geography_scopes)
    )


def require_any_role(user: CurrentUserContext, allowed_roles: Collection[str]) -> None:
    if not any(role in allowed_roles for role in user.roles):
        raise _auth_error("ROLE_NOT_ALLOWED", 403)


def require_geography_access(user: CurrentUserContext, requested_path: str) -> None:
    if not can_read_geography_path(user, requested_path):
        raise _auth_error("GEOGRAPHY_OUT_OF_SCOPE", 403)


@lru_cache(maxsize=4)
def _jwks_client(jwks_url: str, timeout_seconds: float) -> PyJWKClient:
    return PyJWKClient(jwks_url, timeout=timeout_seconds)


def _get_signing_key(jwks_url: str, timeout_seconds: float, token: str):
    return _jwks_client(jwks_url, timeout_seconds).get_signing_key_from_jwt(token).key


def _map_claims(claims: dict[str, Any], client_id: str) -> CurrentUserContext:
    subject = claims.get("sub")
    if not isinstance(subject, str) or not subject:
        raise _auth_error("AUTH_TOKEN_INVALID", 401)

    realm_access = claims.get("realm_access")
    resource_access = claims.get("resource_access")
    raw_roles = []
    if isinstance(realm_access, dict):
        raw_roles.extend(_strings(realm_access.get("roles")))
    if isinstance(resource_access, dict):
        client_access = resource_access.get(client_id)
        if isinstance(client_access, dict):
            raw_roles.extend(_strings(client_access.get("roles")))
    canonical_roles = {legacy_role_aliases.get(role, role) for role in raw_roles}
    roles = [role for role in chart_roles if role in canonical_roles]
    geography_scopes = list(
        dict.fromkeys(
            normalized
            for group in _strings(claims.get("groups"))
            if (normalized := _normalize_geography_path(group)) != "/"
        )
    )
    default_active_geography = geography_scopes[0] if geography_scopes else None
    if "chart_admin" in roles:
        # Installation administrators manage the whole country represented by
        # each assigned Keycloak group, while ordinary users remain at their
        # explicitly assigned state/county/division scope. This enables context
        # switching without granting access to another installed country.
        geography_scopes = list(
            dict.fromkeys(
                country_scope
                for scope in geography_scopes
                if (country_scope := _country_scope(scope)) is not None
            )
        )
    username = claims.get("preferred_username") or claims.get("email") or subject
    email = claims.get("email")
    return CurrentUserContext.model_validate(
        {
            "user_id": subject,
            "username": username if isinstance(username, str) else subject,
            "email": email if isinstance(email, str) else None,
            "roles": roles,
            "geography_scopes": geography_scopes,
            "active_geography_id": default_active_geography,
            "geography_level": _infer_geography_level(default_active_geography),
        }
    )


def _strings(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str)]


def _country_scope(scope: str) -> str | None:
    parts = [part for part in scope.split("/") if part]
    return f"/{parts[0]}" if parts else None


def _normalize_geography_path(path: str) -> str:
    normalized = "/".join(part for part in path.strip().split("/") if part)
    return f"/{normalized}" if normalized else "/"


def _infer_geography_level(scope: str | None) -> str | None:
    if scope is None:
        return None
    depth = len([part for part in scope.split("/") if part])
    return geography_levels[min(depth - 1, len(geography_levels) - 1)]


def _auth_error(code: str, status_code: int) -> HTTPException:
    headers = {"WWW-Authenticate": "Bearer"} if status_code == 401 else None
    return HTTPException(status_code=status_code, detail=code, headers=headers)
