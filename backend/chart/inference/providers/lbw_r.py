from __future__ import annotations

import json
import hashlib
import os
import random
import threading
import time
import urllib.error
import urllib.request

_circuit_lock = threading.Lock()
_circuit_failures = 0
_circuit_open_until = 0.0


class LbwProviderError(RuntimeError):
    def __init__(self, code: str, detail: str = "") -> None:
        super().__init__(f"{code}: {detail}" if detail else code)
        self.code = code
        self.detail = detail


def call_lbw_r(
    base_url: str,
    *,
    model_release_id: str,
    model_file: str,
    model_version: str,
    model_sha256: str,
    model_area: str,
    pregnancy_window: int,
    temperatures_c: tuple[float, float, float],
    reference_temperature_c: float | None = None,
) -> dict:
    body: dict[str, object] = {
        "release_id": model_release_id,
        "model_file": model_file,
        "model_version": model_version,
        "model_sha256": model_sha256,
        "area": model_area,
        "trimester": pregnancy_window,
        "tmax_lag": list(temperatures_c),
    }
    if reference_temperature_c is not None:
        # api_registry.R:150 honours "ref" as the DLNM crosspred anchor;
        # every scored block re-anchors at this temperature instead of
        # using the bundled per-block MMT.
        body["ref"] = float(reference_temperature_c)
    return call_compact_r(
        base_url,
        body=body,
        required={
            "area",
            "geography_level",
            "tmax_lag",
            "ref_temp",
            "odds_ratio",
            "ci95_low",
            "ci95_high",
            "on_training_support",
            "model_file",
            "model_version",
            "model_sha256",
        },
    )


def call_association_r(
    base_url: str,
    *,
    model_release_id: str,
    model_file: str,
    model_version: str,
    model_sha256: str,
    model_area: str,
    outcome: str,
    exposure_values_c: tuple[float, ...],
    reference_temperature_c: float | None = None,
) -> dict:
    body: dict[str, object] = {
        "release_id": model_release_id,
        "model_file": model_file,
        "model_version": model_version,
        "model_sha256": model_sha256,
        "area": model_area,
        "outcome": outcome,
        "exposure_values_c": list(exposure_values_c),
    }
    if reference_temperature_c is not None:
        body["ref"] = float(reference_temperature_c)
    return call_compact_r(
        base_url,
        body=body,
        required={
            "area",
            "geography_level",
            "outcome",
            "exposure_values_c",
            "ref_temp",
            "effect_measure",
            "odds_ratio",
            "ci95_low",
            "ci95_high",
            "on_training_support",
            "model_file",
            "model_version",
            "model_sha256",
        },
    )


def call_compact_r(base_url: str, *, body: dict, required: set[str]) -> dict:
    global _circuit_failures, _circuit_open_until

    encoded_body = json.dumps(body).encode("utf-8")
    idempotency_key = hashlib.sha256(encoded_body).hexdigest()
    request = urllib.request.Request(
        f"{base_url.rstrip('/')}/predict",
        data=encoded_body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Idempotency-Key": idempotency_key,
        },
    )
    now = time.monotonic()
    with _circuit_lock:
        if now < _circuit_open_until:
            raise LbwProviderError("LBW_CIRCUIT_OPEN")

    attempts = int(os.getenv("INFERENCE_LBW_ATTEMPTS", "2"))
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(
                request,
                timeout=float(os.getenv("INFERENCE_LBW_TIMEOUT_SECONDS", "30")),
            ) as response:
                payload = json.loads(response.read().decode("utf-8"))
            with _circuit_lock:
                _circuit_failures = 0
                _circuit_open_until = 0.0
            break
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            if error.code < 500 or attempt + 1 >= attempts:
                _record_failure()
                raise LbwProviderError("LBW_PREDICT_FAILED", detail) from error
            _backoff(attempt)
        except urllib.error.URLError as error:
            if attempt + 1 >= attempts:
                _record_failure()
                raise LbwProviderError("LBW_SERVICE_UNAVAILABLE", str(error)) from error
            _backoff(attempt)
        except TimeoutError as error:
            if attempt + 1 >= attempts:
                _record_failure()
                raise LbwProviderError("LBW_SERVICE_TIMEOUT", str(error)) from error
            _backoff(attempt)
        except json.JSONDecodeError as error:
            _record_failure()
            raise LbwProviderError("LBW_RESPONSE_INVALID", str(error)) from error
    else:
        raise LbwProviderError("LBW_SERVICE_UNAVAILABLE")

    missing = sorted(required - set(payload))
    if missing:
        raise LbwProviderError("LBW_RESPONSE_INVALID", ", ".join(missing))
    return payload


def _record_failure() -> None:
    global _circuit_failures, _circuit_open_until
    with _circuit_lock:
        _circuit_failures += 1
        threshold = int(os.getenv("INFERENCE_LBW_CIRCUIT_FAILURES", "5"))
        if _circuit_failures >= threshold:
            _circuit_open_until = time.monotonic() + float(
                os.getenv("INFERENCE_LBW_CIRCUIT_SECONDS", "30")
            )


def _backoff(attempt: int) -> None:
    base = min(2.0, 0.25 * (2**attempt))
    time.sleep(base + random.uniform(0, base * 0.2))
