"""Which model release + boundary manifests to seed for each country.

Onboarding calls into this at setup-complete time so a fresh install
gets its admin_units + active model release without any manual CLI
step. When a new model lands (a new country or a new outcome), add a
row here and the setup flow picks it up automatically.

Paths are resolved relative to the repo root. Override with the
``CHART_REPO_ROOT`` environment variable when the code runs from an
image whose /app root does not match the checkout layout.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


_DEFAULT_REPO_ROOT = Path(__file__).resolve().parents[3]
REPO_ROOT = Path(os.environ.get("CHART_REPO_ROOT", _DEFAULT_REPO_ROOT))


@dataclass(frozen=True)
class DeployedModelConfig:
    country_code: str
    source_manifest: Path
    crosswalk: Path
    model_release: Path


_MP_LBW = DeployedModelConfig(
    country_code="IN",
    source_manifest=REPO_ROOT
    / "pipelines"
    / "boundaries"
    / "manifests"
    / "mp_model_areas_v1.json",
    crosswalk=REPO_ROOT
    / "pipelines"
    / "boundaries"
    / "data"
    / "mp_district_division_crosswalk.csv",
    model_release=REPO_ROOT
    / "pipelines"
    / "models"
    / "lbw"
    / "model-release.example.json",
)


DEPLOYED_MODEL_CONFIGS: dict[str, tuple[DeployedModelConfig, ...]] = {
    "IN": (_MP_LBW,),
}


def configs_for_country(country_code: str) -> tuple[DeployedModelConfig, ...]:
    """Return the deployed configs whose manifest files all exist on disk.

    A missing manifest is treated as "not deployed here" rather than an
    error, so the setup flow does not fail when a partial checkout is
    running (e.g. the R model bundle has not been mounted yet).
    """

    configs = DEPLOYED_MODEL_CONFIGS.get(country_code.upper(), ())
    return tuple(
        config
        for config in configs
        if config.source_manifest.exists()
        and config.crosswalk.exists()
        and config.model_release.exists()
    )
