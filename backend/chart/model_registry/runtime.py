from __future__ import annotations

import hashlib
import json
import os
import urllib.error
import urllib.request
from pathlib import Path

from .schemas import ModelReleaseSpec
from .service import ModelRegistryError


def warm_model_release(
    spec: ModelReleaseSpec,
    *,
    cache_dir: Path | None = None,
    service_url: str | None = None,
    control_token: str | None = None,
) -> None:
    """Verify and load every artifact for one release into the R runtime."""

    resolved_cache = cache_dir or Path(
        os.getenv(
            "MODEL_CACHE_DIR",
            Path(__file__).resolve().parents[3] / "pipelines/models/lbw/model",
        )
    )
    resolved_url = service_url or os.getenv(
        "INFERENCE_LBW_BASE_URL", os.getenv("LBW_SERVICE_URL", "")
    )
    resolved_token = control_token or os.getenv("MODEL_CONTROL_TOKEN", "")
    if not resolved_url or not resolved_token:
        raise ModelRegistryError("MODEL_RUNTIME_NOT_CONFIGURED")

    for model_file in spec.model_files:
        path = (resolved_cache / model_file.filename).resolve()
        if not path.is_file():
            raise ModelRegistryError("MODEL_RELEASE_FILE_MISSING", str(path))
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != model_file.sha256:
            raise ModelRegistryError(
                "MODEL_RELEASE_CHECKSUM_MISMATCH", model_file.filename
            )
        payload = json.dumps(
            {
                "release_id": spec.id,
                "model_version": spec.version,
                "model_file": model_file.filename,
                "model_sha256": model_file.sha256,
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
            body.get("release_id") != spec.id
            or body.get("model_file") != model_file.filename
            or body.get("model_version") != spec.version
            or body.get("model_sha256") != model_file.sha256
        ):
            raise ModelRegistryError(
                "MODEL_RUNTIME_IDENTITY_MISMATCH", model_file.filename
            )
