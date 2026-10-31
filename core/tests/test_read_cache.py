"""Published reads are built once per data version and revalidated by ETag.

Regression: every map request rebuilt its response, geometry included, and
the browser was told never to keep it, so each reload and each return to a
place loaded again.
"""

from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from chart.api import read_cache


def _app(calls: list[str]) -> FastAPI:
    app = FastAPI()
    app.add_middleware(read_cache.ReadCacheMiddleware)

    @app.get("/heat-outlook/{place}/map")
    def map_(place: str):
        calls.append(place)
        return {"place": place, "built": len(calls)}

    @app.get("/heat-outlook/{place}/missing")
    def missing(place: str):
        calls.append(f"missing {place}")
        raise HTTPException(status_code=404, detail="NOT_AVAILABLE")

    @app.get("/vra/{place}/coverage")
    def coverage(place: str):
        calls.append(f"coverage {place}")
        return {"admin": True}

    return app


def test_reads_are_built_once_per_data_version(monkeypatch) -> None:
    read_cache.clear()
    monkeypatch.setenv("CHART_READ_CACHE", "1")
    version = {"value": "v1"}
    monkeypatch.setattr(read_cache, "data_version", lambda: version["value"])
    calls: list[str] = []
    client = TestClient(_app(calls))

    first = client.get("/heat-outlook/geo-ke/map?outcome=lbw")
    assert first.headers["x-cache"] == "miss"
    assert first.headers["cache-control"].startswith("public, max-age=60")
    again = client.get("/heat-outlook/geo-ke/map?outcome=lbw")
    assert again.headers["x-cache"] == "hit"
    assert again.json() == first.json()
    assert calls == ["geo-ke"]

    # The browser's copy is still current: 304, nothing rebuilt or resent.
    etag = first.headers["etag"]
    revalidated = client.get(
        "/heat-outlook/geo-ke/map?outcome=lbw", headers={"If-None-Match": etag}
    )
    assert revalidated.status_code == 304
    assert calls == ["geo-ke"]

    # Other parameters are other reads.
    client.get("/heat-outlook/geo-ke/map?outcome=under_5_mortality")
    assert calls == ["geo-ke", "geo-ke"]

    # New data (a month loaded, a forecast issued): rebuilt, new ETag.
    version["value"] = "v2"
    fresh = client.get(
        "/heat-outlook/geo-ke/map?outcome=lbw", headers={"If-None-Match": etag}
    )
    assert fresh.status_code == 200 and fresh.headers["x-cache"] == "miss"
    assert fresh.headers["etag"] != etag
    assert len(calls) == 3


def test_callers_never_share_and_errors_or_admin_reads_are_not_kept(
    monkeypatch,
) -> None:
    read_cache.clear()
    monkeypatch.setenv("CHART_READ_CACHE", "1")
    monkeypatch.setattr(read_cache, "data_version", lambda: "v1")
    calls: list[str] = []
    client = TestClient(_app(calls))

    public = client.get("/heat-outlook/geo-ke/map")
    signed = client.get(
        "/heat-outlook/geo-ke/map", headers={"Authorization": "Bearer planner"}
    )
    assert calls == ["geo-ke", "geo-ke"]
    assert signed.headers["cache-control"].startswith("private")
    assert public.headers["etag"] != signed.headers["etag"]

    for _ in range(2):
        assert client.get("/heat-outlook/geo-ke/missing").status_code == 404
        client.get("/vra/geo-ke/coverage")
    assert calls.count("missing geo-ke") == 2
    assert calls.count("coverage geo-ke") == 2


def test_without_a_data_version_nothing_is_cached(monkeypatch) -> None:
    read_cache.clear()
    monkeypatch.setenv("CHART_READ_CACHE", "1")
    monkeypatch.setattr(read_cache, "data_version", lambda: "")
    calls: list[str] = []
    client = TestClient(_app(calls))
    client.get("/heat-outlook/geo-ke/map")
    client.get("/heat-outlook/geo-ke/map")
    assert calls == ["geo-ke", "geo-ke"]


def test_off_unless_the_deployment_turns_it_on(monkeypatch) -> None:
    read_cache.clear()
    monkeypatch.delenv("CHART_READ_CACHE", raising=False)
    monkeypatch.setattr(read_cache, "data_version", lambda: "v1")
    calls: list[str] = []
    client = TestClient(_app(calls))
    client.get("/heat-outlook/geo-ke/map")
    response = client.get("/heat-outlook/geo-ke/map")
    assert calls == ["geo-ke", "geo-ke"]
    assert "etag" not in response.headers
