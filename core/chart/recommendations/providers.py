"""Adapters for what ranks actions and what writes the insight beside them.

Credentials and endpoints come from the server environment only; the database
stores which provider and model an administrator chose. Each language-model
provider can list its models when its API offers that, otherwise
``CHART_INSIGHT_MODELS`` (comma separated) supplies the list.

Environment:

- ``ANTHROPIC_API_KEY`` enables Anthropic.
- ``OPENAI_API_KEY`` and/or ``OPENAI_BASE_URL`` enable OpenAI or any
  OpenAI-compatible server, such as vLLM or Ollama on the sandbox VM.
- ``AWS_REGION`` (and the instance role) enables Amazon Bedrock; needs the
  ``chart[bedrock]`` extra.
- ``CHART_RECOMMENDER_URL`` enables the self-hosted classifier ranker.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Literal

import httpx

TIMEOUT_SECONDS = 20.0
MAX_TOKENS = 300


class ProviderError(RuntimeError):
    """A provider is unavailable or failed; callers fall back to the defaults."""


@dataclass(frozen=True)
class ProviderStatus:
    id: str
    label: str
    available: bool
    reason: str | None = None


def insight_providers() -> list[ProviderStatus]:
    bedrock_reason = None
    try:
        import boto3  # noqa: F401
    except ImportError:
        bedrock_reason = "Install the chart[bedrock] extra on the API server."
    else:
        if not _region():
            bedrock_reason = "Set AWS_REGION on the API server."
    return [
        ProviderStatus("template", "Template (no AI)", True),
        ProviderStatus(
            "bedrock", "Amazon Bedrock", bedrock_reason is None, bedrock_reason
        ),
        _keyed(
            "anthropic",
            "Anthropic",
            bool(_env("ANTHROPIC_API_KEY")),
            "Set ANTHROPIC_API_KEY on the API server.",
        ),
        _keyed(
            "openai",
            "OpenAI or compatible server",
            bool(_env("OPENAI_API_KEY") or _env("OPENAI_BASE_URL")),
            "Set OPENAI_API_KEY, or OPENAI_BASE_URL for a self-hosted model.",
        ),
    ]


def rankers() -> list[ProviderStatus]:
    return [
        ProviderStatus("rules", "Rules (season, cost, department)", True),
        _keyed(
            "classifier",
            "Self-hosted classifier",
            bool(_env("CHART_RECOMMENDER_URL")),
            "Set CHART_RECOMMENDER_URL to the classifier service.",
        ),
    ]


def list_models(
    provider: str,
) -> tuple[list[str], Literal["provider", "configured", "none"]]:
    """The provider's models and where the list came from."""

    configured = [
        m.strip() for m in _env("CHART_INSIGHT_MODELS").split(",") if m.strip()
    ]
    try:
        if provider == "anthropic":
            body = _get("https://api.anthropic.com/v1/models", _anthropic_headers())
            return sorted(item["id"] for item in body["data"]), "provider"
        if provider == "openai":
            body = _get(f"{_openai_base()}/models", _openai_headers())
            return sorted(item["id"] for item in body["data"]), "provider"
        if provider == "bedrock":
            return _bedrock_models(), "provider"
    except (ProviderError, httpx.HTTPError, KeyError, TypeError):
        if configured:
            return configured, "configured"
        raise
    return [], "none"


def generate(provider: str, model: str, system: str, prompt: str) -> str:
    """One short completion; raises ProviderError on any failure."""

    try:
        if provider == "anthropic":
            body = _post(
                "https://api.anthropic.com/v1/messages",
                _anthropic_headers(),
                {
                    "model": model,
                    "max_tokens": MAX_TOKENS,
                    "system": system,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
            text = "".join(
                part.get("text", "")
                for part in body["content"]
                if part["type"] == "text"
            )
        elif provider == "openai":
            body = _post(
                f"{_openai_base()}/chat/completions",
                _openai_headers(),
                {
                    "model": model,
                    "max_tokens": MAX_TOKENS,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": prompt},
                    ],
                },
            )
            text = body["choices"][0]["message"]["content"]
        elif provider == "bedrock":
            text = _bedrock_converse(model, system, prompt)
        else:
            raise ProviderError(f"UNKNOWN_PROVIDER:{provider}")
    except (httpx.HTTPError, KeyError, IndexError, TypeError) as exc:
        raise ProviderError(type(exc).__name__) from exc
    text = (text or "").strip()
    if not text:
        raise ProviderError("EMPTY_RESPONSE")
    return text


def classify(plan: dict, candidates: list[dict]) -> tuple[dict[str, float], str]:
    """Scores from the self-hosted classifier (see docs/recommendations.md)."""

    url = _env("CHART_RECOMMENDER_URL").rstrip("/")
    if not url:
        raise ProviderError("CLASSIFIER_NOT_CONFIGURED")
    try:
        body = _post(f"{url}/rank", {}, {"plan": plan, "candidates": candidates})
        scores = {str(key): float(value) for key, value in body["scores"].items()}
        return scores, str(body.get("model") or "classifier")
    except (httpx.HTTPError, KeyError, TypeError, ValueError, AttributeError) as exc:
        raise ProviderError(type(exc).__name__) from exc


def _bedrock_client(service: str):
    try:
        import boto3
    except ImportError as exc:
        raise ProviderError("BEDROCK_NOT_INSTALLED") from exc
    return boto3.client(service, region_name=_region())


def _bedrock_models() -> list[str]:
    try:
        client = _bedrock_client("bedrock")
        models = {
            item["modelId"]
            for item in client.list_foundation_models(byOutputModality="TEXT")[
                "modelSummaries"
            ]
            if "ON_DEMAND" in item.get("inferenceTypesSupported", [])
        }
        # Newer models are invoked through cross-region inference profiles.
        profiles = client.list_inference_profiles().get("inferenceProfileSummaries", [])
        models.update(item["inferenceProfileId"] for item in profiles)
    except ProviderError:
        raise
    except Exception as exc:  # botocore raises many client error types
        raise ProviderError(type(exc).__name__) from exc
    return sorted(models)


def _bedrock_converse(model: str, system: str, prompt: str) -> str:
    try:
        response = _bedrock_client("bedrock-runtime").converse(
            modelId=model,
            system=[{"text": system}],
            messages=[{"role": "user", "content": [{"text": prompt}]}],
            inferenceConfig={"maxTokens": MAX_TOKENS},
        )
        parts = response["output"]["message"]["content"]
    except ProviderError:
        raise
    except Exception as exc:  # botocore raises many client error types
        raise ProviderError(type(exc).__name__) from exc
    return "".join(part.get("text", "") for part in parts)


def _keyed(id: str, label: str, available: bool, reason: str) -> ProviderStatus:
    return ProviderStatus(id, label, available, None if available else reason)


def _anthropic_headers() -> dict[str, str]:
    return {"x-api-key": _env("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01"}


def _openai_headers() -> dict[str, str]:
    key = _env("OPENAI_API_KEY")
    return {"Authorization": f"Bearer {key}"} if key else {}


def _openai_base() -> str:
    return (_env("OPENAI_BASE_URL") or "https://api.openai.com/v1").rstrip("/")


def _region() -> str:
    return _env("AWS_REGION") or _env("AWS_DEFAULT_REGION")


def _get(url: str, headers: dict[str, str]) -> dict:
    response = httpx.get(url, headers=headers, timeout=TIMEOUT_SECONDS)
    response.raise_for_status()
    return response.json()


def _post(url: str, headers: dict[str, str], body: dict) -> dict:
    response = httpx.post(url, headers=headers, json=body, timeout=TIMEOUT_SECONDS)
    response.raise_for_status()
    return response.json()


def _env(name: str) -> str:
    return os.getenv(name, "").strip()
