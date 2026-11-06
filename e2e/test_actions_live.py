"""The action repository end to end: Airtable rows -> publisher -> feed -> API.

The runner published e2e/fixtures/airtable_actions.json through the real
publisher (``chart.actions.publish``) from the local Airtable stand-in into
``CHART_E2E_ACTIONS_FEED``; the stand-in serves that file as the public feed
the API reads. No real Airtable or S3 is contacted.
"""

import json
import os
import socket
import subprocess
import sys
import time
from pathlib import Path

import httpx
import pytest

ROOT = Path(__file__).resolve().parents[1]
FEED_DIR = Path(os.environ.get("CHART_E2E_ACTIONS_FEED", "."))
PRIVATE = ["curator@example.org", "Jane Curator", "Curators Ltd", "internal reviewer"]
STUB_AIRTABLE = {
    "AIRTABLE_TOKEN": "e2e-airtable-token",
    "AIRTABLE_BASE_ID": "appE2Etest0000001",
}


def control(**state):
    httpx.post(
        os.environ["CHART_E2E_AI_STUB"] + "/control", json=state
    ).raise_for_status()


def publish(out: Path, **env) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-m", "chart.actions.publish", "--out", str(out)],
        cwd=ROOT,
        env={
            **os.environ,
            "AIRTABLE_API_URL": os.environ["CHART_E2E_AI_STUB"],
            **STUB_AIRTABLE,
            **env,
        },
        capture_output=True,
        text=True,
    )


@pytest.fixture
def stub_state():
    yield
    control(feed="ok", airtable_empty=False)


def by_title(items):
    return {item["title"]: item for item in items}


def test_publisher_keeps_only_published_allowed_content():
    text = (FEED_DIR / "actions.json").read_text()
    feed = json.loads(text)
    assert feed["schema_version"] == 1
    actions = by_title(feed["actions"])
    # Every page of every table was read (two rows per page); Drafts never leave.
    assert set(actions) == {
        "Act on IMD heat alerts",
        "Cool shelters in markets",
        "Counsel pregnant women on heat",
        "County heat early warning",
        "Flood barriers",
        "Year-round heat surveillance",
    }
    assert not any(value in text for value in PRIVATE)
    counsel = actions["Counsel pregnant women on heat"]
    assert counsel["countries"] == [] and counsel["seasons"] == ["before"]
    assert actions["Act on IMD heat alerts"]["countries"] == ["IN"]
    assert actions["County heat early warning"]["countries"] == ["KE"]
    assert actions["Year-round heat surveillance"]["seasons"] == [
        "before",
        "during",
        "after",
    ]
    assert counsel["references"] == [
        {"citation": "WHO heat guide", "url": "https://www.who.int/e2e-heat"},
        {"citation": "A citation without a link", "url": None},
    ]
    assert counsel["by_country"]["KE"]["stakeholders"] == ["CHP", "CHA"]
    assert counsel["by_country"]["IN"] == {"stakeholders": ["ASHA"]}
    # The image is copied (Airtable links expire) and the feed points at the copy.
    (image,) = counsel["images"]
    assert image["filename"] == "counselling.png"
    assert image["url"].endswith("/v1/images/attE2EImage00001.png")
    assert (FEED_DIR / "images/attE2EImage00001.png").read_bytes()[:4] == b"\x89PNG"


def test_publisher_refuses_an_empty_feed_and_a_bad_token(tmp_path, stub_state):
    control(airtable_empty=True)
    empty = publish(tmp_path / "empty")
    assert empty.returncode == 1
    assert "refusing to publish an empty feed" in empty.stderr
    assert not (tmp_path / "empty/actions.json").exists()

    control(airtable_empty=False)
    denied = publish(tmp_path / "denied", AIRTABLE_TOKEN="wrong-token")
    assert denied.returncode != 0 and "401" in denied.stderr
    assert not (tmp_path / "denied/actions.json").exists()
    assert "wrong-token" not in denied.stderr

    missing = publish(tmp_path / "missing", AIRTABLE_TOKEN="")
    assert missing.returncode == 2 and "Set AIRTABLE_TOKEN" in missing.stderr


def test_api_serves_a_country_its_own_actions_in_its_wording(client):
    response = client.get("/actions", params={"geography": "geo-ke-kajiado"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["source"] == "feed" and body["country"] == "KE"
    actions = by_title(body["items"])
    assert "County heat early warning" in actions
    assert "Act on IMD heat alerts" not in actions
    assert "Unreviewed draft action" not in actions
    counsel = actions["Counsel pregnant women on heat"]
    assert counsel["stakeholders"] == ["CHP", "CHA"]
    assert counsel["departments"] == ["Ministry of Health; county health departments"]
    assert counsel["description"].startswith("Community health promoters")
    assert "countries" not in counsel and "by_country" not in counsel
    assert not any(value in response.text for value in PRIVATE)

    india = by_title(
        client.get("/actions", params={"geography": "geo-in-madhya-pradesh"}).json()[
            "items"
        ]
    )
    assert (
        "Act on IMD heat alerts" in india and "County heat early warning" not in india
    )
    assert india["Counsel pregnant women on heat"]["stakeholders"] == ["ASHA"]

    everywhere = client.get("/actions").json()
    assert everywhere["country"] is None and len(everywhere["items"]) == 6
    generic = by_title(everywhere["items"])["Counsel pregnant women on heat"]
    assert generic["stakeholders"] == ["Community health worker"]

    unknown = client.get("/actions", params={"geography": "geo-nowhere"})
    assert unknown.status_code == 404
    assert unknown.json()["error"] == "GEOGRAPHY_NOT_FOUND"


def test_api_keeps_the_last_good_feed_when_it_breaks(client, stub_state):
    good = client.get("/actions", params={"geography": "geo-ke-kajiado"}).json()
    for state in ("down", "invalid"):
        control(feed=state)
        response = client.get("/actions", params={"geography": "geo-ke-kajiado"})
        assert response.status_code == 200, response.text
        assert response.json() == good
        assert "leak@example.org" not in response.text


def test_without_any_good_read_the_bundled_copy_is_served():
    # A fresh API whose feed URL refuses connections, as on a machine offline.
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        closed = sock.getsockname()[1]
    env = {
        **os.environ,
        "CHART_ACTIONS_URL": f"http://127.0.0.1:{closed}/actions.json",
        "CHART_ACTIONS_TIMEOUT_SECONDS": "2",
    }
    api = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "chart.api.app:app", "--port", str(port)],
        cwd=ROOT,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        url = f"http://127.0.0.1:{port}"
        for _ in range(60):
            try:
                if httpx.get(url + "/live", timeout=2).is_success:
                    break
            except httpx.HTTPError:
                time.sleep(1)
        response = httpx.get(url + "/actions", timeout=30)
        assert response.status_code == 200, response.text
        bundled = json.loads(
            (ROOT / "core/chart/actions/actions.json").read_text(encoding="utf-8")
        )
        assert response.json()["source"] == "bundled"
        assert [item["id"] for item in response.json()["items"]] == [
            action["id"] for action in bundled["actions"]
        ]
    finally:
        api.terminate()
        api.wait(timeout=15)
