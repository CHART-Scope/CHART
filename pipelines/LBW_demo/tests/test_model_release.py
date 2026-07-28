from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from pipelines.LBW_demo.model_release import (
    ReleaseValidationError,
    load_and_verify_release,
)


def _sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def _write_release(tmp_path: Path) -> tuple[Path, Path, Path]:
    division_path = tmp_path / "division.rds"
    state_path = tmp_path / "state.rds"
    division_content = b"division model"
    state_content = b"state model"
    division_path.write_bytes(division_content)
    state_path.write_bytes(state_content)

    manifest_path = tmp_path / "model-release.json"
    manifest_path.write_text(
        json.dumps(
            {
                "id": "lbw-test-1.0.0",
                "version": "1.0.0",
                "model_files": [
                    {
                        "filename": division_path.name,
                        "sha256": _sha256(division_content),
                    },
                    {
                        "filename": state_path.name,
                        "sha256": _sha256(state_content),
                    },
                ],
            }
        ),
        encoding="utf-8",
    )
    return manifest_path, division_path, state_path


def test_loads_identity_and_verified_model_hashes(tmp_path: Path) -> None:
    manifest_path, division_path, state_path = _write_release(tmp_path)

    release = load_and_verify_release(manifest_path, division_path, state_path)

    assert release.release_id == "lbw-test-1.0.0"
    assert release.version == "1.0.0"
    assert release.division_sha256 == _sha256(b"division model")
    assert release.state_sha256 == _sha256(b"state model")
    assert release.environment() == {
        "LBW_MODEL_RELEASE_ID": "lbw-test-1.0.0",
        "LBW_MODEL_VERSION": "1.0.0",
        "LBW_MODEL_DIVISION_SHA256": _sha256(b"division model"),
        "LBW_MODEL_STATE_SHA256": _sha256(b"state model"),
    }


def test_rejects_a_model_that_does_not_match_the_release(tmp_path: Path) -> None:
    manifest_path, division_path, state_path = _write_release(tmp_path)
    division_path.write_bytes(b"tampered division model")

    with pytest.raises(ReleaseValidationError, match="checksum mismatch"):
        load_and_verify_release(manifest_path, division_path, state_path)


def test_rejects_a_model_missing_from_the_release(tmp_path: Path) -> None:
    manifest_path, division_path, state_path = _write_release(tmp_path)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["model_files"] = manifest["model_files"][1:]
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    with pytest.raises(ReleaseValidationError, match="absent from"):
        load_and_verify_release(manifest_path, division_path, state_path)


@pytest.mark.parametrize("field", ["id", "version"])
def test_rejects_missing_release_identity(tmp_path: Path, field: str) -> None:
    manifest_path, division_path, state_path = _write_release(tmp_path)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest[field] = ""
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    with pytest.raises(ReleaseValidationError, match=field):
        load_and_verify_release(manifest_path, division_path, state_path)


def test_rejects_duplicate_model_entries(tmp_path: Path) -> None:
    manifest_path, division_path, state_path = _write_release(tmp_path)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["model_files"].append(manifest["model_files"][0])
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    with pytest.raises(ReleaseValidationError, match="duplicate filename"):
        load_and_verify_release(manifest_path, division_path, state_path)
