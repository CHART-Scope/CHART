"""The declared input arity must match what the fitted artifact expects.

``input_contract.variables[].length`` is what the backend builds an exposure
vector from; the authoritative arity lives in ``block$basis$lag`` inside the
``.rds``. Nothing reconciled the two, so a manifest could declare three values
against a four-lag model and only fail inside R at score time, per-request, in
production. This closes that gap in CI.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

from chart.model_registry.schemas import ModelReleaseSpec

REPO_ROOT = Path(__file__).resolve().parents[2]
MODEL_ROOT = REPO_ROOT / "pipelines" / "models"
MANIFESTS = sorted(MODEL_ROOT.rglob("model-release*.json"))

READ_ARITY = r"""
bundle <- readRDS(commandArgs(trailingOnly = TRUE)[1])
areas <- if (!is.null(bundle$areas)) bundle$areas else bundle$bundle$areas
lengths <- c()
for (name in names(areas)) {
  block <- areas[[name]]
  blocks <- if (!is.null(block$basis)) list(block) else block
  for (entry in blocks) {
    if (!is.null(entry$basis)) {
      lengths <- c(lengths, as.integer(diff(as.numeric(entry$basis$lag)) + 1L))
    }
  }
}
cat(paste(unique(lengths), collapse = ","))
"""


def _artifact_arity(artifact: Path) -> set[int]:
    result = subprocess.run(
        ["Rscript", "--vanilla", "-e", READ_ARITY, str(artifact)],
        capture_output=True,
        text=True,
        timeout=180,
    )
    if result.returncode != 0:
        pytest.fail(f"could not read {artifact.name}: {result.stderr.strip()}")
    return {int(value) for value in result.stdout.strip().split(",") if value}


@pytest.mark.skipif(shutil.which("Rscript") is None, reason="Rscript not installed")
@pytest.mark.parametrize("manifest", MANIFESTS, ids=lambda path: path.name)
def test_declared_length_matches_the_fitted_artifact(manifest: Path) -> None:
    spec = ModelReleaseSpec.model_validate_json(manifest.read_text(encoding="utf-8"))
    assert spec.input_contract is not None
    declared = [variable.length for variable in spec.input_contract.variables]
    assert len(declared) == 1, f"{manifest.name} declares more than one variable"

    for model_file in spec.model_files:
        # Located the way the runtime locates it - a recursive search by
        # filename under the model root - rather than by a fixed subdirectory.
        # Artifacts now sit under `artifacts/<country>/<outcome>/<version>/`,
        # mirroring the S3 keys, and a hardcoded `model/` made every case here
        # skip silently the moment they moved.
        matches = list(MODEL_ROOT.rglob(model_file.filename))
        if not matches:
            pytest.skip(f"{model_file.filename} not present")
        assert len(matches) == 1, (
            f"{model_file.filename} appears {len(matches)} times under "
            f"{MODEL_ROOT}; the runtime requires exactly one match"
        )
        artifact = matches[0]
        arity = _artifact_arity(artifact)
        assert arity == {declared[0]}, (
            f"{manifest.name} declares length={declared[0]} but "
            f"{model_file.filename} expects {sorted(arity)}"
        )


def test_every_manifest_declares_exactly_one_exposure_variable() -> None:
    """The backend builds one vector; more than one would be ambiguous."""

    for manifest in MANIFESTS:
        spec = ModelReleaseSpec.model_validate_json(
            manifest.read_text(encoding="utf-8")
        )
        assert spec.input_contract is not None, manifest.name
        assert len(spec.input_contract.variables) == 1, manifest.name


def test_daily_and_monthly_models_are_distinguishable_from_the_contract() -> None:
    """LBW reads monthly means; under-5 reads daily maxima. The contract says so.

    This is the difference that stops under-5 reusing the monthly batch path,
    so it must be readable from the manifest rather than inferred from names.
    """

    intervals = {}
    for manifest in MANIFESTS:
        spec = ModelReleaseSpec.model_validate_json(
            manifest.read_text(encoding="utf-8")
        )
        assert spec.input_contract is not None
        variable = spec.input_contract.variables[0]
        intervals[spec.outcome] = (variable.interval, variable.length)

    assert intervals["lbw"] == ("month", 3)
    assert intervals["under_5_mortality"] == ("day", 4)


@pytest.mark.parametrize("manifest", MANIFESTS, ids=lambda path: path.stem)
def test_every_release_names_the_modeller_output_it_came_from(manifest: Path) -> None:
    """A release must say which fitted model it is.

    The compact artifact we score with is derived from a much larger object the
    modelling team produces, and that lineage used to live only inside the
    ``.rds``'s own provenance block - which needs R to read, and which one
    release shipped without entirely. A release whose source cannot be named is
    a number nobody can trace back to a fit, so this is a hard requirement
    rather than a nicety.
    """
    spec = ModelReleaseSpec.model_validate(json.loads(manifest.read_text()))
    assert spec.artifact_source is not None, (
        f"{manifest.name} does not record the modeller output it was built "
        "from. Add an 'artifact_source' block naming the source file and its "
        "sha256."
    )
    assert spec.artifact_source.filename.endswith(".rds")
