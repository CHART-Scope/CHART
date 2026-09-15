from __future__ import annotations

import hashlib
import json
from pathlib import Path
from unittest.mock import patch

import pytest

from chart.model_registry.runtime import prepare_model_release, warm_model_release
from chart.model_registry.schemas import ModelReleaseSpec
from chart.model_registry.service import ModelRegistryError


def _spec(digest: str, *, filename: str = "kenya.rds") -> ModelReleaseSpec:
    return ModelReleaseSpec.model_validate(
        {
            "id": "lbw-ke-test",
            "module": "prediction",
            "outcome": "lbw",
            "version": "0.1.0-review",
            "runtime": {
                "adapter": "compact_r_registry",
                "artifact_type": "rds",
            },
            "base_uri": "s3://private/models",
            "temperature_input": "three monthly temperatures",
            "months_required": 3,
            "model_files": [{"filename": filename, "sha256": digest}],
            "areas": [
                {
                    "place_code": "kajiado",
                    "country_code": "KE",
                    "level": "county",
                    "model_file": "kenya.rds",
                    "model_area_name": "South-eastern",
                }
            ],
        }
    )


def test_warm_model_release_verifies_and_pins_runtime_identity(tmp_path: Path) -> None:
    artifact = tmp_path / "kenya.rds"
    artifact.write_bytes(b"compact-model")
    digest = hashlib.sha256(artifact.read_bytes()).hexdigest()
    spec = _spec(digest)

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self):
            return json.dumps(
                {
                    "release_id": spec.id,
                    "model_version": spec.version,
                    "model_file": "kenya.rds",
                    "model_sha256": digest,
                }
            ).encode()

    with patch(
        "chart.model_registry.runtime.urllib.request.urlopen",
        return_value=FakeResponse(),
    ) as urlopen:
        warm_model_release(
            spec,
            cache_dir=tmp_path,
            service_url="http://lbw.test",
            control_token="control-secret",
        )

    request = urlopen.call_args.args[0]
    payload = json.loads(request.data)
    assert payload == {
        "release_id": "lbw-ke-test",
        "model_version": "0.1.0-review",
        "model_file": "kenya.rds",
        "model_sha256": digest,
        "local_path": str(artifact),
    }
    assert request.headers["X-chart-model-control-token"] == "control-secret"


def test_warm_model_release_rejects_checksum_mismatch(tmp_path: Path) -> None:
    (tmp_path / "kenya.rds").write_bytes(b"wrong-model")

    with pytest.raises(ModelRegistryError) as caught:
        warm_model_release(
            _spec("a" * 64),
            cache_dir=tmp_path,
            service_url="http://lbw.test",
            control_token="control-secret",
        )

    assert caught.value.code == "MODEL_RELEASE_CHECKSUM_MISMATCH"


def test_model_release_rejects_artifact_path_traversal() -> None:
    with pytest.raises(ValueError, match="MODEL_RELEASE_FILENAME_INVALID"):
        _spec("a" * 64, filename="../kenya.rds")


def test_prepare_model_release_rejects_unknown_runtime_adapter() -> None:
    spec = _spec("a" * 64)
    spec.runtime.adapter = "future_python_adapter"
    with pytest.raises(ModelRegistryError) as caught:
        prepare_model_release(spec)
    assert caught.value.code == "MODEL_RUNTIME_ADAPTER_UNSUPPORTED"


def test_model_release_rejects_place_label_that_disagrees_with_level() -> None:
    document = {
        "id": "label-test",
        "module": "prediction",
        "outcome": "lbw",
        "version": "1.0.0",
        "base_uri": "s3://private/models",
        "temperature_input": "three monthly temperatures",
        "months_required": 3,
        "model_files": [{"filename": "model.rds", "sha256": "a" * 64}],
        "geography": {
            "country_code": "IN",
            "country_name": "India",
            "root_id": "geo-in",
            "root_path": "/india",
            "analytics_slug": "madhya-pradesh",
            "levels": [{"key": "geo_level_1", "label": "State", "sort_order": 10}],
            "places": [
                {
                    "place_code": "madhya-pradesh",
                    "country_code": "IN",
                    "level": "state",
                    "display_name": "Madhya Pradesh",
                    "geography_id": "geo-in-madhya-pradesh",
                    "app_level": "geo_level_1",
                    "level_label": "County",
                    "path": "/india/madhya-pradesh",
                    "boundary_key": "madhya-pradesh",
                }
            ],
        },
        "areas": [
            {
                "place_code": "madhya-pradesh",
                "country_code": "IN",
                "level": "state",
                "model_file": "model.rds",
                "model_area_name": "Madhya Pradesh",
            }
        ],
    }

    with pytest.raises(
        ValueError, match="MODEL_RELEASE_GEOGRAPHY_LEVEL_LABEL_MISMATCH"
    ):
        ModelReleaseSpec.model_validate(document)
