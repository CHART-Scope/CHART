from __future__ import annotations

from chart.identity import service


def _config() -> service.IdentityConfig:
    return service.IdentityConfig(
        base_url="http://keycloak.test",
        admin_realm="master",
        target_realm="chart",
        username="admin",
        password="admin",
        client_id="chart-api",
    )


def test_group_path_reads_children_from_the_parent_endpoint(monkeypatch) -> None:
    calls: list[tuple[str, str]] = []

    def request(_config, _token, method, path, **_kwargs):
        calls.append((method, path))
        if path == "/groups?briefRepresentation=false":
            return [{"id": "india-id", "name": "india"}]
        if path == "/groups/india-id/children?briefRepresentation=false":
            return [{"id": "mp-id", "name": "madhya-pradesh"}]
        raise AssertionError(f"Unexpected Keycloak request: {method} {path}")

    monkeypatch.setattr(service, "_request", request)

    group = service._ensure_group_path(_config(), "token", "/india/madhya-pradesh")

    assert group == {"id": "mp-id", "name": "madhya-pradesh"}
    assert calls == [
        ("GET", "/groups?briefRepresentation=false"),
        ("GET", "/groups/india-id/children?briefRepresentation=false"),
    ]


def test_group_path_recovers_when_another_request_creates_the_group(
    monkeypatch,
) -> None:
    root_reads = 0

    def request(_config, _token, method, path, **_kwargs):
        nonlocal root_reads
        if method == "GET" and path == "/groups?briefRepresentation=false":
            root_reads += 1
            return [] if root_reads == 1 else [{"id": "india-id", "name": "india"}]
        if method == "POST" and path == "/groups":
            raise service.IdentityError("USER_IDENTITY_GROUP_CONFLICT", 409)
        raise AssertionError(f"Unexpected Keycloak request: {method} {path}")

    monkeypatch.setattr(service, "_request", request)

    group = service._ensure_group_path(_config(), "token", "/india")

    assert group == {"id": "india-id", "name": "india"}
    assert root_reads == 2


def test_recover_admin_resets_password_and_restores_roles(monkeypatch) -> None:
    calls: list[tuple[str, str, object]] = []
    config = _config()

    monkeypatch.setattr(service, "_config", lambda: config)
    monkeypatch.setattr(service, "_admin_token", lambda _config: "token")
    monkeypatch.setattr(
        service,
        "_find_user",
        lambda _config, _token, _username, _email: {"id": "user-1"},
    )
    monkeypatch.setattr(
        service,
        "_add_client_roles",
        lambda _config, _token, user_id, roles: calls.append(("ROLES", user_id, roles)),
    )

    def request(_config, _token, method, path, **kwargs):
        calls.append((method, path, kwargs.get("body")))

    monkeypatch.setattr(service, "_request", request)

    recovered = service.recover_admin(
        username="chart-admin",
        email="admin@example.org",
        password="new-password",
    )

    assert recovered.user_id == "user-1"
    assert calls == [
        (
            "PUT",
            "/users/user-1",
            {
                "username": "chart-admin",
                "email": "admin@example.org",
                "enabled": True,
                "emailVerified": True,
            },
        ),
        (
            "PUT",
            "/users/user-1/reset-password",
            {
                "type": "password",
                "value": "new-password",
                "temporary": False,
            },
        ),
        ("ROLES", "user-1", ["chart_admin", "content_editor"]),
    ]


def test_recover_admin_requires_an_existing_identity(monkeypatch) -> None:
    monkeypatch.setattr(service, "_config", _config)
    monkeypatch.setattr(service, "_admin_token", lambda _config: "token")
    monkeypatch.setattr(
        service,
        "_find_user",
        lambda _config, _token, _username, _email: None,
    )

    try:
        service.recover_admin(
            username="missing",
            email="missing@example.org",
            password="new-password",
        )
    except service.IdentityError as error:
        assert error.code == "ADMIN_RECOVERY_USER_NOT_FOUND"
        assert error.status_code == 404
    else:
        raise AssertionError("Expected recovery of an unknown user to fail")
