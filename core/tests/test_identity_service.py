from __future__ import annotations

from chart.identity import service


def _config() -> service.IdentityConfig:
    return service.IdentityConfig(
        base_url="http://keycloak.test",
        admin_realm="master",
        target_realm="chart",
        username="admin",
        password="admin",
        client_id="chart-core",
    )


def test_recover_admin_reenables_the_account(monkeypatch) -> None:
    calls: list[tuple[str, str, object]] = []
    config = _config()

    monkeypatch.setattr(service, "_config", lambda: config)
    monkeypatch.setattr(service, "_admin_token", lambda _config: "token")
    monkeypatch.setattr(
        service,
        "_find_user",
        lambda _config, _token, _username, _email: {"id": "user-1"},
    )

    def request(_config, _token, method, path, **kwargs):
        calls.append((method, path, kwargs.get("body")))

    monkeypatch.setattr(service, "_request", request)

    recovered = service.recover_admin(
        username="chart-admin",
        email="admin@example.org",
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
        )
    except service.IdentityError as error:
        assert error.code == "ADMIN_RECOVERY_USER_NOT_FOUND"
        assert error.status_code == 404
    else:
        raise AssertionError("Expected recovery of an unknown user to fail")
