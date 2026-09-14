from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

from chart.inference.service import LbwScore


class OpenAICompatibleExplainer:
    """Optional plain-language adapter for local or hosted compatible APIs."""

    def __init__(
        self,
        *,
        base_url: str,
        model: str,
        api_key: str | None = None,
        timeout_seconds: float = 10,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.api_key = api_key
        self.timeout_seconds = timeout_seconds

    def explain(self, score: LbwScore) -> str:
        body = json.dumps(
            {
                "model": self.model,
                "temperature": 0,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "Explain this saved CHART planning result in two short, "
                            "plain-language sentences. Use only the supplied facts. "
                            "Do not describe it as an individual probability."
                        ),
                    },
                    {
                        "role": "user",
                        "content": json.dumps(
                            {
                                "area": score.area,
                                "odds_ratio": score.odds_ratio,
                                "ci95": [score.ci95_low, score.ci95_high],
                                "reference_temperature_c": score.reference_temperature_c,
                                "on_training_support": score.on_training_support,
                                "warning": score.warning,
                            },
                            separators=(",", ":"),
                        ),
                    },
                ],
            }
        ).encode("utf-8")
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        request = urllib.request.Request(
            f"{self.base_url}/chat/completions",
            data=body,
            method="POST",
            headers=headers,
        )
        try:
            with urllib.request.urlopen(
                request, timeout=self.timeout_seconds
            ) as response:
                payload = json.loads(response.read().decode("utf-8"))
            content = payload["choices"][0]["message"]["content"].strip()
        except (
            KeyError,
            IndexError,
            TypeError,
            json.JSONDecodeError,
            urllib.error.URLError,
            TimeoutError,
        ) as error:
            raise RuntimeError("EXPLANATION_UNAVAILABLE") from error
        if not content or len(content) > 1200:
            raise RuntimeError("EXPLANATION_INVALID")
        return content


def configured_explainer() -> OpenAICompatibleExplainer | None:
    if os.getenv("INFERENCE_LLM_ENABLED", "false").lower() not in {
        "1",
        "true",
        "yes",
    }:
        return None
    base_url = os.getenv("INFERENCE_LLM_BASE_URL", "").strip()
    model = os.getenv("INFERENCE_LLM_MODEL", "").strip()
    if not base_url or not model:
        return None
    try:
        timeout = float(os.getenv("INFERENCE_LLM_TIMEOUT_SECONDS", "10"))
    except ValueError:
        return None
    return OpenAICompatibleExplainer(
        base_url=base_url,
        model=model,
        api_key=os.getenv("INFERENCE_LLM_API_KEY") or None,
        timeout_seconds=max(1, timeout),
    )
