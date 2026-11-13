from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Annotated

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from jwt.exceptions import PyJWKClientError, PyJWTError

from chart.access.guards import PUBLIC_VISITOR, can_read_place, context_for
from chart.access.principal import load_principal
from chart.access.signin import SignIn, link_sign_in
from chart.shared.db.session import get_session_factory

from .schemas import CurrentUserContext

logger = logging.getLogger(__name__)

#: The one Keycloak role CHART still reads: it makes the seeded account the
#: first platform admin when the installation has none (docs/access-control.md).
BOOTSTRAP_ADMIN_ROLE = "chart_admin"


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
    client_id = os.getenv("KEYCLOAK_CLIENT_ID", "chart-core")
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
    return resolve_user(
        verify_keycloak_token(credentials.credentials, get_auth_config())
    )


def public_read_enabled() -> bool:
    """Whether published estimates may be read without signing in.

    On by setting ``CHART_PUBLIC_READ=true``; an installation that holds data
    it may not publish leaves it off and keeps every read behind sign-in.
    """
    return os.getenv("CHART_PUBLIC_READ", "false").strip().lower() in {
        "1",
        "true",
        "yes",
    }


def require_reader(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_auth)],
) -> CurrentUserContext:
    """A signed-in user, or the public visitor on an open installation.

    Only for reads of published estimates. Anything that changes data, queues
    work or shows a person's own records keeps ``require_current_user``.
    """
    if credentials is not None and credentials.scheme.lower() == "bearer":
        return resolve_user(
            verify_keycloak_token(credentials.credentials, get_auth_config())
        )
    if public_read_enabled():
        return PUBLIC_VISITOR
    raise _auth_error("AUTH_TOKEN_REQUIRED", 401)


def verify_keycloak_token(token: str, config: AuthConfig) -> SignIn:
    """Who the token says the person is; nothing about what they may do."""

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
    return _sign_in(claims, config.client_id)


def resolve_user(sign_in: SignIn) -> CurrentUserContext:
    """The person's access from CHART's database, linking the sign-in first
    when it is not cached (invitations, the first admin, the visit)."""

    with get_session_factory()() as session:
        principal = load_principal(
            session, sign_in.user_id, lambda s: link_sign_in(s, sign_in)
        )
    return context_for(
        principal,
        username=sign_in.username,
        email=sign_in.email,
        display_name=sign_in.display_name,
    )


def apply_active_geography(
    user: CurrentUserContext, active_geography_id: str | None
) -> CurrentUserContext:
    if active_geography_id is None:
        return user
    if not can_read_place(user, active_geography_id):
        # The header is a stale client hint (sessionStorage remembered a
        # geography that just left scope). Snap back to the default landing
        # area instead of 403ing; direct reads still enforce.
        logger.info(
            "auth: dropping out-of-scope active_geography header %r for user %s",
            active_geography_id,
            user.user_id,
        )
        return user
    return user.model_copy(
        update={"active_geography_id": _normalize_geography_path(active_geography_id)}
    )


@lru_cache(maxsize=4)
def _jwks_client(jwks_url: str, timeout_seconds: float) -> PyJWKClient:
    return PyJWKClient(jwks_url, timeout=timeout_seconds)


def _get_signing_key(jwks_url: str, timeout_seconds: float, token: str):
    return _jwks_client(jwks_url, timeout_seconds).get_signing_key_from_jwt(token).key


def _sign_in(claims: dict[str, Any], client_id: str) -> SignIn:
    subject = claims.get("sub")
    if not isinstance(subject, str) or not subject:
        raise _auth_error("AUTH_TOKEN_INVALID", 401)
    roles: list[str] = []
    realm_access = claims.get("realm_access")
    if isinstance(realm_access, dict):
        roles.extend(_strings(realm_access.get("roles")))
    resource_access = claims.get("resource_access")
    if isinstance(resource_access, dict):
        client_access = resource_access.get(client_id)
        if isinstance(client_access, dict):
            roles.extend(_strings(client_access.get("roles")))
    username = claims.get("preferred_username") or claims.get("email") or subject
    email = claims.get("email")
    name = claims.get("name")
    return SignIn(
        user_id=subject,
        username=username if isinstance(username, str) else subject,
        email=email if isinstance(email, str) else None,
        email_verified=claims.get("email_verified") is True,
        display_name=name if isinstance(name, str) and name.strip() else None,
        bootstrap_admin=BOOTSTRAP_ADMIN_ROLE in roles,
    )


def _strings(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str)]


def _normalize_geography_path(path: str) -> str:
    normalized = "/".join(part for part in path.strip().split("/") if part)
    return f"/{normalized}" if normalized else "/"


def _auth_error(code: str, status_code: int) -> HTTPException:
    headers = {"WWW-Authenticate": "Bearer"} if status_code == 401 else None
    return HTTPException(status_code=status_code, detail=code, headers=headers)
