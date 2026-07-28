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
