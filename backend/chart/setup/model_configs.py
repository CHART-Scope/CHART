"""Discover deployable model releases and their installation geography."""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from pathlib import Path

from pydantic import ValidationError

from chart.model_registry.place_sets import PlaceSetError, resolve_release_places
from chart.model_registry.schemas import ModelReleaseSpec, ReleaseGeographySpec

logger = logging.getLogger(__name__)

_DEFAULT_REPO_ROOT = Path(__file__).resolve().parents[3]
REPO_ROOT = Path(os.environ.get("CHART_REPO_ROOT", _DEFAULT_REPO_ROOT))
MODEL_RELEASE_ROOT = REPO_ROOT / "pipelines" / "models"

_DISCOVERY_ERRORS: tuple[type[BaseException], ...] = (
    KeyError,
    OSError,
    json.JSONDecodeError,
    TypeError,
    ValidationError,
    PlaceSetError,
)


@dataclass(frozen=True)
class DeployedModelConfig:
    country_code: str
    model_release: Path
    boundary_artifact: Path | None = None
    review_only: bool = False


@dataclass(frozen=True)
class _DiscoveredModel:
    config: DeployedModelConfig
    spec: ModelReleaseSpec
    geography: ReleaseGeographySpec


def _allow_review_models() -> bool:
    return os.getenv("CHART_ENABLE_REVIEW_MODELS", "").lower() in {
        "1",
        "true",
        "yes",
    }


def _discover_models() -> tuple[_DiscoveredModel, ...]:
    models: list[_DiscoveredModel] = []
    for path in sorted(MODEL_RELEASE_ROOT.rglob("model-release*.json")):
        try:
            spec = ModelReleaseSpec.model_validate_json(
                path.read_text(encoding="utf-8")
            )
            places = resolve_release_places(spec, repo_root=REPO_ROOT)
            geography = places.geography
            boundary = places.shape_path
            review_only = "review" in spec.version.lower()
            if review_only and not _allow_review_models():
                continue
            if boundary is not None and not boundary.exists():
                continue
            models.append(
                _DiscoveredModel(
                    config=DeployedModelConfig(
                        country_code=geography.country_code.upper(),
                        model_release=path,
                        boundary_artifact=boundary,
                        review_only=review_only,
                    ),
                    spec=spec,
                    geography=geography,
                )
            )
        except _DISCOVERY_ERRORS as error:
            logger.warning("model_configs: skipping %s: %r", path, error)
    return tuple(models)


def configs_for_country(country_code: str) -> tuple[DeployedModelConfig, ...]:
    normalized = country_code.upper()
    return tuple(
        model.config
        for model in _discover_models()
        if model.config.country_code == normalized
    )


def deployed_configs() -> tuple[DeployedModelConfig, ...]:
    """Return every manifest-defined model available to this installation."""

    return tuple(model.config for model in _discover_models())


def deployed_geography_ids_by_country() -> dict[str, frozenset[str]]:
    """Return the manifest navigation IDs that should be visible per country."""

    ids: dict[str, set[str]] = {}
    for model in _discover_models():
        country_code = model.geography.country_code.upper()
        country_ids = ids.setdefault(country_code, set())
        country_ids.add(model.geography.root_id)
        country_ids.update(place.geography_id for place in model.geography.places)
    return {country: frozenset(values) for country, values in ids.items()}
