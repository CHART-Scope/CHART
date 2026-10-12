from __future__ import annotations

import hashlib
import json
import os
import urllib.error
import urllib.request
from pathlib import Path

from chart.inference.env import resolve_lbw_service_url

from .schemas import ModelReleaseSpec
from .service import ModelRegistryError


def prepare_model_release(spec: ModelReleaseSpec) -> None:
    """Dispatch artifact preparation through the adapter named by the release."""

    adapter = spec.runtime.adapter if spec.runtime is not None else None
    if adapter == "compact_r_registry":
        warm_model_release(spec)
        return
    raise ModelRegistryError("MODEL_RUNTIME_ADAPTER_UNSUPPORTED", str(adapter))


def warm_model_release(
    spec: ModelReleaseSpec,
    *,
    cache_dir: Path | None = None,
    service_url: str | None = None,
    control_token: str | None = None,
) -> None:
    """Verify and load every artifact for one release into the R runtime."""

    for model_file in spec.model_files:
        warm_model_artifact(
            release_id=spec.id,
            model_version=spec.version,
            model_file=model_file.filename,
            model_sha256=model_file.sha256,
            cache_dir=cache_dir,
            service_url=service_url,
            control_token=control_token,
        )


def model_cache_dir() -> Path:
    return Path(
        os.getenv(
            "MODEL_CACHE_DIR",
            Path(__file__).resolve().parents[3] / "pipelines/models",
        )
    ).resolve()


def locate_model_artifact(
    model_file: str, model_sha256: str, cache_dir: Path | None = None
) -> Path:
    """The one cached copy of an artifact, verified against its checksum."""

    resolved_cache = (cache_dir or model_cache_dir()).resolve()
    matches = [
        candidate.resolve()
        for candidate in resolved_cache.rglob(Path(model_file).name)
        if candidate.is_file()
    ]
    if len(matches) != 1 or not matches[0].is_relative_to(resolved_cache):
        raise ModelRegistryError(
            "MODEL_RELEASE_FILE_MISSING",
            f"{model_file}: matches={len(matches)}",
        )
    path = matches[0]
    if hashlib.sha256(path.read_bytes()).hexdigest() != model_sha256:
        raise ModelRegistryError("MODEL_RELEASE_CHECKSUM_MISMATCH", model_file)
    return path


def warm_model_artifact(
    *,
    release_id: str,
    model_version: str,
    model_file: str,
    model_sha256: str,
    cache_dir: Path | None = None,
    service_url: str | None = None,
    control_token: str | None = None,
) -> None:
    """Verify and reload one immutable artifact after a runtime restart."""

    resolved_url = resolve_lbw_service_url(service_url)
    resolved_token = control_token or os.getenv("MODEL_CONTROL_TOKEN", "")
    if not resolved_url or not resolved_token:
        raise ModelRegistryError("MODEL_RUNTIME_NOT_CONFIGURED")

    path = locate_model_artifact(model_file, model_sha256, cache_dir)
    payload = json.dumps(
        {
            "release_id": release_id,
            "model_version": model_version,
            "model_file": model_file,
            "model_sha256": model_sha256,
            "local_path": str(path),
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        f"{resolved_url.rstrip('/')}/models/load",
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-CHART-Model-Control-Token": resolved_token,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError) as error:
        raise ModelRegistryError("MODEL_RUNTIME_UNAVAILABLE", str(error)) from error
    except json.JSONDecodeError as error:
        raise ModelRegistryError("MODEL_RUNTIME_RESPONSE_INVALID") from error
    if (
        body.get("release_id") != release_id
        or body.get("model_file") != model_file
        or body.get("model_version") != model_version
        or body.get("model_sha256") != model_sha256
    ):
        raise ModelRegistryError("MODEL_RUNTIME_IDENTITY_MISMATCH", model_file)
