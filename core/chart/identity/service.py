from __future__ import annotations

import json
import os
import random
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass


class IdentityError(RuntimeError):
    def __init__(self, code: str, status_code: int = 502) -> None:
        super().__init__(code)
        self.code = code
        self.status_code = status_code


@dataclass(frozen=True)
class IdentityUser:
    user_id: str
    username: str
    email: str
    created: bool


@dataclass(frozen=True)
class IdentityConfig:
    base_url: str
    admin_realm: str
    target_realm: str
    username: str
    password: str
    client_id: str


def ensure_account(
    *, name: str, email: str, operation_id: str | None = None
) -> IdentityUser:
    """The Keycloak account for an email, created when missing.

    Accounts carry no CHART access (that lives in CHART's database), so an
    existing account is reused rather than refused: inviting someone already
    signed up elsewhere only adds a membership. Sign-in is by emailed code;
    there is no password.
    """
    config = _config()
    token = _admin_token(config)
    username = email.strip().lower()
    user = _find_user(config, token, username, email)
    created = False
    if user is None:
        body = {
            "username": username,
            "email": email,
            "firstName": name,
            "enabled": True,
            "emailVerified": True,
            **(
                {"attributes": {"chartProvisioningOperation": [operation_id]}}
                if operation_id
                else {}
            ),
        }
        try:
            _request(
                config,
                token,
                "POST",
                "/users",
                body=body,
                expected={201, 204},
                conflict_code="USER_IDENTITY_USER_CONFLICT",
            )
            created = True
        except IdentityError as error:
            if error.code != "USER_IDENTITY_USER_CONFLICT":
                raise
        user = _find_user(config, token, username, email)
        if user is None:
            raise IdentityError("USER_IDENTITY_USER_CREATE_FAILED")
    return IdentityUser(
        user_id=str(user["id"]),
        username=str(user.get("username") or username),
        email=email,
        created=created,
    )


INVITATION_LIFESPAN_SECONDS = 7 * 24 * 3600


def find_account(username: str) -> IdentityUser | None:
    """The Keycloak account with this username or email, if any."""
    config = _config()
    token = _admin_token(config)
    user = _find_user(config, token, username, username)
    if user is None:
        return None
    return IdentityUser(
        user_id=str(user["id"]),
        username=str(user.get("username") or username),
        email=str(user.get("email") or ""),
        created=False,
    )


def send_invitation(user_id: str) -> None:
    """Have Keycloak email an invitation (docs/sign-in.md).

    The link confirms the address and then opens CHART's sign-in, where the
    person signs in with an emailed code; there is no password to set.
    """
    origin = os.getenv("CHART_WEB_ORIGIN", "").rstrip("/")
    if not origin:
        raise IdentityError("USER_INVITE_ORIGIN_MISSING", 500)
    config = _config()
    token = _admin_token(config)
    query = urllib.parse.urlencode(
        {
            "client_id": "chart-web",
            "redirect_uri": f"{origin}/auth/signin",
            "lifespan": INVITATION_LIFESPAN_SECONDS,
        }
    )
    _request(
        config,
        token,
        "PUT",
        f"/users/{urllib.parse.quote(user_id)}/execute-actions-email?{query}",
        body=["VERIFY_EMAIL"],
        expected={204},
    )


def disable_user(user_id: str) -> None:
    config = _config()
    token = _admin_token(config)
    _request(
        config,
        token,
        "PUT",
        f"/users/{urllib.parse.quote(user_id)}",
        body={"enabled": False},
        expected={204},
    )


def enable_user(user_id: str) -> None:
    config = _config()
    token = _admin_token(config)
    _request(
        config,
        token,
        "PUT",
        f"/users/{urllib.parse.quote(user_id)}",
        body={"enabled": True},
        expected={204},
    )


def sign_out(user_id: str) -> None:
    """End the person's Keycloak sessions so no new token is issued."""
    config = _config()
    token = _admin_token(config)
    _request(
        config,
        token,
        "POST",
        f"/users/{urllib.parse.quote(user_id)}/logout",
        expected={204},
    )


def delete_user(user_id: str) -> None:
    config = _config()
    token = _admin_token(config)
    _request(
        config,
        token,
        "DELETE",
        f"/users/{urllib.parse.quote(user_id)}",
        expected={204, 404},
    )


def recover_admin(*, username: str, email: str) -> IdentityUser:
    """Re-enable an administrator; they sign in with a code sent to ``email``."""
    config = _config()
    token = _admin_token(config)
    user = _find_user(config, token, username, email)
    if user is None:
        raise IdentityError("ADMIN_RECOVERY_USER_NOT_FOUND", 404)

    user_id = str(user["id"])
    _request(
        config,
        token,
        "PUT",
        f"/users/{urllib.parse.quote(user_id)}",
        body={
            "username": username,
            "email": email,
            "enabled": True,
            "emailVerified": True,
        },
        expected={204},
    )
    return IdentityUser(
        user_id=user_id,
        username=username,
        email=email,
        created=False,
    )


def _config() -> IdentityConfig:
    base_url = os.getenv(
        "KEYCLOAK_ADMIN_URL",
        os.getenv("KEYCLOAK_SERVER_URL", "http://127.0.0.1:8080"),
    ).rstrip("/")
    username = os.getenv("KEYCLOAK_ADMIN_USERNAME", "admin")
    password = os.getenv("KEYCLOAK_ADMIN_PASSWORD", "admin")
    if not base_url or not username or not password:
        raise IdentityError("USER_IDENTITY_CONFIG_INVALID", 500)
    return IdentityConfig(
        base_url=base_url,
        admin_realm=os.getenv("KEYCLOAK_ADMIN_REALM", "master"),
        target_realm=os.getenv("KEYCLOAK_REALM", "chart"),
        username=username,
        password=password,
        client_id=os.getenv("KEYCLOAK_CLIENT_ID", "chart-core"),
    )


def _admin_token(config: IdentityConfig) -> str:
    url = (
        f"{config.base_url}/realms/{config.admin_realm}/"
        "protocol/openid-connect/token"
    )
    body = urllib.parse.urlencode(
        {
            "grant_type": "password",
            "client_id": "admin-cli",
            "username": config.username,
            "password": config.password,
        }
    ).encode()
    request = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(
                request,
                timeout=float(os.getenv("KEYCLOAK_TIMEOUT_SECONDS", "5")),
            ) as response:
                token = json.loads(response.read())["access_token"]
                return str(token)
        except (OSError, KeyError, json.JSONDecodeError) as error:
            if attempt == 2:
                raise IdentityError("USER_IDENTITY_ADMIN_AUTH_FAILED") from error
            _backoff(attempt)
    raise IdentityError("USER_IDENTITY_ADMIN_AUTH_FAILED")


def _find_user(config, token, username, email):
    query = urllib.parse.urlencode({"username": username, "exact": "true"})
    users = _request(config, token, "GET", f"/users?{query}")
    if users:
        return users[0]
    query = urllib.parse.urlencode({"email": email, "exact": "true"})
    users = _request(config, token, "GET", f"/users?{query}")
    return users[0] if users else None


def _matches_operation(user: dict, operation_id: str | None) -> bool:
    if operation_id is None:
        return False
    attributes = user.get("attributes")
    if not isinstance(attributes, dict):
        return False
    value = attributes.get("chartProvisioningOperation")
    if isinstance(value, list):
        return operation_id in value
    return value == operation_id


def _request(
    config,
    token,
    method,
    path,
    *,
    body=None,
    expected={200},
    conflict_code=None,
):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(
        f"{config.base_url}/admin/realms/{config.target_realm}{path}",
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            **({"Content-Type": "application/json"} if data is not None else {}),
        },
    )
    retryable = method in {"GET", "PUT", "DELETE"}
    attempts = 3 if retryable else 1
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(
                request,
                timeout=float(os.getenv("KEYCLOAK_TIMEOUT_SECONDS", "5")),
            ) as response:
                content = response.read()
                if response.status not in expected:
                    raise IdentityError("USER_IDENTITY_UNAVAILABLE")
                return json.loads(content) if content else None
        except urllib.error.HTTPError as error:
            if error.code == 409:
                raise IdentityError(
                    conflict_code or "USER_IDENTITY_UNAVAILABLE", 409
                ) from error
            if retryable and error.code in {429, 500, 502, 503, 504}:
                if attempt + 1 < attempts:
                    _backoff(attempt)
                    continue
            raise IdentityError("USER_IDENTITY_UNAVAILABLE") from error
        except (OSError, json.JSONDecodeError) as error:
            if retryable and attempt + 1 < attempts:
                _backoff(attempt)
                continue
            raise IdentityError("USER_IDENTITY_UNAVAILABLE") from error
    raise IdentityError("USER_IDENTITY_UNAVAILABLE")


def _backoff(attempt: int) -> None:
    base = min(2.0, 0.2 * (2**attempt))
    time.sleep(base + random.uniform(0, base * 0.25))
