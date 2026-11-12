"""Plan recommendations and their provider settings over real HTTP and PostGIS.

The candidates are the published heat actions for the plan's country, from the
action feed the runner published (e2e/fixtures/airtable_actions.json; see
test_actions_live.py). Language-model and classifier calls go to the local
stand-in started by the runner (e2e/stub_ai_server.py); no real provider is
contacted.
"""

import json
import os
import uuid
from pathlib import Path

import httpx
import pytest
from sqlalchemy import create_engine, text

COUNSEL = "recE2ECounsel0001"  # before, low birth weight, low cost
WATCH = "recE2EWatch000001"  # year-round, low birth weight, high cost
KENYA = "recE2EKenya000001"  # Kenya only, before, no additional cost
SHELTER = "recE2EShelter0001"  # during the season, medium cost
DEFAULTS = {"ranker": "rules", "insight_provider": "template", "insight_model": None}


def scalar(sql, **params):
    engine = create_engine(os.environ["DATABASE_URL"])
    with engine.connect() as connection:
        return connection.scalar(text(sql), params)


def stub_requests(path):
    log = Path(os.environ["CHART_E2E_EVIDENCE"]) / "ai-stub-requests.jsonl"
    lines = log.read_text().splitlines() if log.is_file() else []
    return [entry for entry in map(json.loads, lines) if entry["path"] == path]


def control(**state):
    httpx.post(
        os.environ["CHART_E2E_AI_STUB"] + "/control", json=state
    ).raise_for_status()


@pytest.fixture
def plan(client, tokens):
    headers = tokens["kenya-planner"]
    response = client.post(
        "/saved-plans",
        json={
            "name": "E2E recommendations " + uuid.uuid4().hex[:6],
            "geography_id": "geo-ke-kajiado",
            "outcome": "lbw",
            "choices": {"view": "projection", "period": "2027-2031"},
        },
        headers=headers,
    )
    assert response.status_code == 201, response.text
    yield response.json()
    client.delete(f"/saved-plans/{response.json()['id']}", headers=headers)


@pytest.fixture
def settings(client, admin_headers):
    """Restores the installation defaults whatever a test changed."""

    yield lambda body: client.put(
        "/recommendation-settings", json=body, headers=admin_headers
    )
    control(rank_fail=False)
    restored = client.put(
        "/recommendation-settings", json=DEFAULTS, headers=admin_headers
    )
    assert restored.status_code == 200, restored.text


def recommend(client, tokens, plan_id, user="kenya-planner"):
    return client.post(
        f"/saved-plans/{plan_id}/recommendations",
        json={"limit": 3},
        headers=tokens[user],
    )


def test_default_rules_ranking_and_template_insight(client, tokens, plan):
    response = recommend(client, tokens, plan["id"])
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["ranker"] == "rules" and body["ranker_note"] is None
    # Timing 4 + outcome 3 (+ cost 2/1 unless risk is clearly raised); the
    # India-only, Draft and flood actions are never candidates for Kajiado.
    assert [item["id"] for item in body["items"]] == [COUNSEL, WATCH, KENYA]
    assert body["items"][0]["reasons"][:2] == [
        "Fits before heat season, when this plan applies.",
        "Targets low birth weight, this plan's outcome.",
    ]
    insight = body["insight"]
    assert insight["provider"] == "template" and insight["generated"] is False
    assert "Kajiado" in insight["text"]
    assert (
        scalar("SELECT insight FROM saved_plan WHERE id = :id", id=plan["id"]) is None
    )


def test_recommendations_follow_plan_ownership_and_roles(client, tokens, plan):
    other = recommend(client, tokens, plan["id"], user="india-planner")
    assert other.status_code == 404
    assert other.json()["error"] == "SAVED_PLAN_NOT_FOUND"
    assert recommend(client, tokens, plan["id"], user="denied").status_code == 403
    assert (
        client.post(
            f"/saved-plans/{plan['id']}/recommendations",
            json={"limit": 3},
        ).status_code
        == 401
    )
    bad = client.post(
        f"/saved-plans/{plan['id']}/recommendations",
        json={"limit": 0},
        headers=tokens["kenya-planner"],
    )
    assert bad.status_code == 422


def test_settings_are_admin_only_and_report_configuration(
    client, tokens, admin_headers
):
    for user in ("kenya-planner", "denied"):
        assert (
            client.get("/recommendation-settings", headers=tokens[user]).status_code
            == 403
        )
        assert (
            client.put(
                "/recommendation-settings", json=DEFAULTS, headers=tokens[user]
            ).status_code
            == 403
        )
    response = client.get("/recommendation-settings", headers=admin_headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["settings"] == DEFAULTS
    providers = {item["id"]: item for item in body["providers"]}
    assert providers["template"]["available"] and providers["openai"]["available"]
    assert not providers["anthropic"]["available"]
    assert "ANTHROPIC_API_KEY" in providers["anthropic"]["reason"]
    assert not providers["bedrock"]["available"]
    rankers = {item["id"]: item for item in body["rankers"]}
    assert rankers["classifier"]["available"]

    models = client.get(
        "/recommendation-settings/providers/openai/models", headers=admin_headers
    )
    assert models.status_code == 200, models.text
    assert models.json() == {
        "provider": "openai",
        "models": ["stub-fail", "stub-small"],
        "source": "provider",
    }
    unconfigured = client.get(
        "/recommendation-settings/providers/anthropic/models", headers=admin_headers
    )
    assert unconfigured.status_code == 422
    assert all(not entry["authorization"] for entry in stub_requests("/v1/models"))


def test_invalid_settings_are_refused_without_writes(client, admin_headers, settings):
    before = scalar("SELECT count(*) FROM recommendation_setting")
    events = scalar(
        "SELECT count(*) FROM audit_event WHERE event_type = 'recommendation_settings_changed'"
    )
    for body, code in [
        (
            {**DEFAULTS, "insight_provider": "anthropic", "insight_model": "x"},
            "INSIGHT_PROVIDER_NOT_CONFIGURED",
        ),
        ({**DEFAULTS, "insight_provider": "openai"}, "INSIGHT_MODEL_REQUIRED"),
        ({**DEFAULTS, "ranker": "magic"}, "RANKER_UNKNOWN"),
        ({**DEFAULTS, "insight_provider": "skynet"}, "INSIGHT_PROVIDER_UNKNOWN"),
    ]:
        response = settings(body)
        assert response.status_code == 422, response.text
        assert response.json()["error"] == code
    assert scalar("SELECT count(*) FROM recommendation_setting") == before
    assert (
        scalar(
            "SELECT count(*) FROM audit_event "
            "WHERE event_type = 'recommendation_settings_changed'"
        )
        == events
    )


def test_classifier_and_language_model_with_cache_and_fallbacks(
    client, tokens, plan, settings
):
    chosen = {
        "ranker": "classifier",
        "insight_provider": "openai",
        "insight_model": "stub-small",
    }
    response = settings(chosen)
    assert response.status_code == 200, response.text
    assert response.json()["settings"] == chosen
    assert (
        scalar("SELECT ranker FROM recommendation_setting WHERE id = 1") == "classifier"
    )
    payload = scalar(
        "SELECT payload FROM audit_event WHERE event_type = 'recommendation_settings_changed' "
        "ORDER BY id DESC LIMIT 1"
    )
    assert payload["after"] == chosen

    calls = len(stub_requests("/v1/chat/completions"))
    body = recommend(client, tokens, plan["id"]).json()
    assert body["ranker"] == "classifier"
    assert body["ranker_model"] == "stub-classifier-v1"
    # The stand-in scores the offered (feed) order in reverse.
    offered = stub_requests("/rank")[-1]["body"]
    assert [c["id"] for c in offered["candidates"]] == [SHELTER, COUNSEL, KENYA, WATCH]
    assert offered["plan"]["country_code"] == "KE"
    assert [item["id"] for item in body["items"]] == [WATCH, KENYA, COUNSEL]
    insight = body["insight"]
    assert insight == {
        "provider": "openai",
        "model": "stub-small",
        "text": "Stub insight for Kajiado: start with the first action.",
        "generated": True,
        "note": None,
    }
    sent = stub_requests("/v1/chat/completions")[-1]
    prompt = sent["body"]["messages"][-1]["content"]
    assert "Place: Kajiado" in prompt and "1. Year-round heat surveillance" in prompt
    assert sent["authorization"] is False
    cached = scalar("SELECT insight FROM saved_plan WHERE id = :id", id=plan["id"])
    assert cached["model"] == "stub-small" and cached["text"] == insight["text"]

    # A repeat view reuses the stored insight instead of calling the model.
    assert recommend(client, tokens, plan["id"]).json()["insight"] == insight
    assert len(stub_requests("/v1/chat/completions")) == calls + 1

    # Provider failures fall back explicitly; the request still succeeds.
    control(rank_fail=True)
    assert settings({**chosen, "insight_model": "stub-fail"}).status_code == 200
    body = recommend(client, tokens, plan["id"]).json()
    assert body["ranker"] == "rules"
    assert "classifier was unavailable" in body["ranker_note"]
    assert body["insight"]["provider"] == "template"
    assert body["insight"]["generated"] is False
    assert "openai could not write an insight" in body["insight"]["note"]
