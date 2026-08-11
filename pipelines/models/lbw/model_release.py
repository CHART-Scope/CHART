#!/usr/bin/env python3
"""Validate an LBW model release and launch a command with its identity."""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import re
import sys
from pathlib import Path
from typing import Any, NamedTuple, Sequence


SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
COUNTRY_CODE_PATTERN = re.compile(r"^[A-Z]{2}$")
S3_URI_PATTERN = re.compile(r"^s3://[a-z0-9][a-z0-9.-]*[a-z0-9](/.+)?$")

VALID_LEVELS: frozenset[str] = frozenset(
    {
        "country",
        "state",
        "province",
        "division",
        "district",
        "county",
        "sub-county",
        "sub-district",
    }
)


class ReleaseValidationError(ValueError):
    """Raised when a model release is incomplete or fails integrity checks."""


class ModelRelease(NamedTuple):
    release_id: str
    version: str
    division_sha256: str
    state_sha256: str

    def environment(self) -> dict[str, str]:
        return {
            "LBW_MODEL_RELEASE_ID": self.release_id,
            "LBW_MODEL_VERSION": self.version,
            "LBW_MODEL_DIVISION_SHA256": self.division_sha256,
            "LBW_MODEL_STATE_SHA256": self.state_sha256,
        }


class VerifiedModelRelease(NamedTuple):
    """Manifest identity and verified local files for a generic model bundle."""

    release_id: str
    version: str
    model_paths: dict[str, str]
    model_hashes: dict[str, str]


def _required_text(document: dict[str, Any], field: str) -> str:
    value = document.get(field)
    if not isinstance(value, str) or not value.strip():
        raise ReleaseValidationError(
            f"Model release manifest field {field!r} must be a non-empty string"
        )
    return value.strip()


def _manifest_hashes(document: dict[str, Any]) -> dict[str, str]:
    entries = document.get("model_files")
    if not isinstance(entries, list):
        raise ReleaseValidationError(
            "Model release manifest field 'model_files' must be a list"
        )

    hashes: dict[str, str] = {}
    for index, entry in enumerate(entries):
        if not isinstance(entry, dict):
            raise ReleaseValidationError(
                f"Model release entry {index} must be an object"
            )

        filename = entry.get("filename")
        digest = entry.get("sha256")
        if not isinstance(filename, str) or not filename:
            raise ReleaseValidationError(
                f"Model release entry {index} has no valid filename"
            )
        if Path(filename).name != filename:
            raise ReleaseValidationError(
                f"Model release filename must not contain a path: {filename!r}"
            )
        if filename in hashes:
            raise ReleaseValidationError(
                f"Model release contains duplicate filename {filename!r}"
            )
        if not isinstance(digest, str) or not SHA256_PATTERN.fullmatch(digest.lower()):
            raise ReleaseValidationError(
                f"Model release entry {filename!r} has no valid SHA-256"
            )
        hashes[filename] = digest.lower()

    return hashes


def _validate_top_level(document: dict[str, Any]) -> None:
    """Ensure the manifest declares module, outcome, climate hazard, and S3 base."""

    _required_text(document, "module")
    _required_text(document, "outcome")
    _required_text(document, "climate_hazard")
    _required_text(document, "temperature_input")
    if document.get("months_required") != 3:
        raise ReleaseValidationError(
            "Model release months_required must equal the three-month LBW contract"
        )
    base_uri = _required_text(document, "base_uri")
    if not S3_URI_PATTERN.match(base_uri):
        raise ReleaseValidationError(
            f"Model release base_uri must be an s3:// URI, got {base_uri!r}"
        )


def _validate_areas(document: dict[str, Any], model_filenames: set[str]) -> None:
    """Each area must name a real geography, level, country, and manifest model_file."""

    entries = document.get("areas")
    if not isinstance(entries, list) or not entries:
        raise ReleaseValidationError(
            "Model release manifest field 'areas' must be a non-empty list"
        )

    seen_place_codes: set[str] = set()
    for index, entry in enumerate(entries):
        if not isinstance(entry, dict):
            raise ReleaseValidationError(
                f"Model release area {index} must be an object"
            )
        for field in (
            "place_code",
            "model_file",
            "model_area_name",
            "country_code",
            "level",
        ):
            value = entry.get(field)
            if not isinstance(value, str) or not value:
                raise ReleaseValidationError(
                    f"Model release area {index} field {field!r} must be a non-empty string"
                )

        place_code = entry["place_code"]
        if place_code in seen_place_codes:
            raise ReleaseValidationError(
                f"Model release contains duplicate place_code {place_code!r}"
            )
        seen_place_codes.add(place_code)

        if entry["model_file"] not in model_filenames:
            raise ReleaseValidationError(
                f"Model release area {place_code!r} references unknown model_file "
                f"{entry['model_file']!r}"
            )
        if not COUNTRY_CODE_PATTERN.fullmatch(entry["country_code"]):
            raise ReleaseValidationError(
                f"Model release area {place_code!r} country_code must be an "
                f"ISO 3166-1 alpha-2 code like 'IN' or 'KE'"
            )
        if entry["level"] not in VALID_LEVELS:
            raise ReleaseValidationError(
                f"Model release area {place_code!r} level must be one of "
                f"{sorted(VALID_LEVELS)}, got {entry['level']!r}"
            )


def _sha256(path: Path) -> str:
    if not path.is_file():
        raise ReleaseValidationError(f"LBW model file does not exist: {path}")

    digest = hashlib.sha256()
    with path.open("rb") as model_file:
        for chunk in iter(lambda: model_file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _verify_model(
    *, label: str, model_path: Path, manifest_hashes: dict[str, str]
) -> str:
    filename = model_path.name
    try:
        expected = manifest_hashes[filename]
    except KeyError as error:
        raise ReleaseValidationError(
            f"{label.capitalize()} model {filename!r} is absent from the release manifest"
        ) from error

    actual = _sha256(model_path)
    if not hmac.compare_digest(actual, expected):
        raise ReleaseValidationError(
            f"{label.capitalize()} model checksum mismatch for {model_path}: "
            f"expected {expected}, got {actual}"
        )
    return expected


def load_and_verify_release(
    manifest_path: Path, division_path: Path, state_path: Path
) -> ModelRelease:
    try:
        document = json.loads(manifest_path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise ReleaseValidationError(
            f"Model release manifest does not exist: {manifest_path}"
        ) from error
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ReleaseValidationError(
            f"Cannot read model release manifest {manifest_path}: {error}"
        ) from error

    if not isinstance(document, dict):
        raise ReleaseValidationError("Model release manifest must contain an object")

    release_id = _required_text(document, "id")
    version = _required_text(document, "version")
    _validate_top_level(document)
    manifest_hashes = _manifest_hashes(document)
    _validate_areas(document, set(manifest_hashes))
    division_sha256 = _verify_model(
        label="division",
        model_path=division_path,
        manifest_hashes=manifest_hashes,
    )
    state_sha256 = _verify_model(
        label="state",
        model_path=state_path,
        manifest_hashes=manifest_hashes,
    )
    return ModelRelease(
        release_id=release_id,
        version=version,
        division_sha256=division_sha256,
        state_sha256=state_sha256,
    )


def load_and_verify_models(
    manifest_path: Path, model_paths: Sequence[Path]
) -> VerifiedModelRelease:
    """Verify every manifest model file without assuming state/division roles."""

    try:
        document = json.loads(manifest_path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise ReleaseValidationError(
            f"Model release manifest does not exist: {manifest_path}"
        ) from error
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ReleaseValidationError(
            f"Cannot read model release manifest {manifest_path}: {error}"
        ) from error
    if not isinstance(document, dict):
        raise ReleaseValidationError("Model release manifest must contain an object")

    release_id = _required_text(document, "id")
    version = _required_text(document, "version")
    _validate_top_level(document)
    manifest_hashes = _manifest_hashes(document)
    _validate_areas(document, set(manifest_hashes))

    paths_by_name: dict[str, Path] = {}
    for path in model_paths:
        resolved = path.resolve()
        if resolved.name in paths_by_name:
            raise ReleaseValidationError(
                f"Duplicate local model filename {resolved.name!r}"
            )
        paths_by_name[resolved.name] = resolved
    missing = sorted(set(manifest_hashes) - set(paths_by_name))
    unexpected = sorted(set(paths_by_name) - set(manifest_hashes))
    if missing or unexpected:
        raise ReleaseValidationError(
            f"Local model files do not match manifest: missing={missing}; "
            f"unexpected={unexpected}"
        )

    verified = {
        filename: _verify_model(
            label="model",
            model_path=paths_by_name[filename],
            manifest_hashes=manifest_hashes,
        )
        for filename in sorted(paths_by_name)
    }
    return VerifiedModelRelease(
        release_id=release_id,
        version=version,
        model_paths={
            filename: str(paths_by_name[filename]) for filename in sorted(paths_by_name)
        },
        model_hashes=verified,
    )


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Validate local LBW models against a release manifest."
    )
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--division", type=Path)
    parser.add_argument("--state", type=Path)
    parser.add_argument(
        "--model",
        action="append",
        default=[],
        type=Path,
        help="Generic model file; repeat once for every model_files entry.",
    )
    parser.add_argument(
        "command",
        nargs=argparse.REMAINDER,
        help="Optional command to execute with validated release metadata.",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    release: VerifiedModelRelease | ModelRelease
    try:
        if args.model:
            if args.division is not None or args.state is not None:
                raise ReleaseValidationError(
                    "Use either generic --model arguments or legacy --division/--state"
                )
            release = load_and_verify_models(args.manifest.resolve(), args.model)
        else:
            if args.division is None or args.state is None:
                raise ReleaseValidationError(
                    "Legacy releases require both --division and --state"
                )
            release = load_and_verify_release(
                args.manifest.resolve(),
                args.division.resolve(),
                args.state.resolve(),
            )
    except ReleaseValidationError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1

    command = list(args.command)
    if command and command[0] == "--":
        command.pop(0)
    if not command:
        print(
            f"Verified LBW model release {release.release_id} "
            f"(version {release.version})"
        )
        return 0

    if isinstance(release, VerifiedModelRelease):
        print(
            "Error: generic model releases are prepared and activated through "
            "the CHART model registry; command launch is supported only for the "
            "legacy state/division runtime",
            file=sys.stderr,
        )
        return 1

    environment = os.environ.copy()
    environment.update(release.environment())
    try:
        os.execvpe(command[0], command, environment)
    except OSError as error:
        print(f"Error: cannot execute {command[0]!r}: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
