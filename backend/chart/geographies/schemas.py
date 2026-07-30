from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass
from typing import Literal

BoundaryAuthority = Literal["national", "un_authoritative", "open_global"]


class BoundaryRegistryError(ValueError):
    def __init__(self, code: str, detail: str) -> None:
        super().__init__(f"{code}: {detail}")
        self.code = code
        self.detail = detail


@dataclass(frozen=True)
class BoundarySource:
    key: str
    name: str
    authority: BoundaryAuthority
    source_url: str
    license_name: str
    attribution: str
    native_levels: tuple[str, ...]
    country_codes: frozenset[str] | None = None
    license_requires_review: bool = False

    def supports(self, country_code: str, native_level: str) -> bool:
        country_supported = (
            self.country_codes is None or country_code in self.country_codes
        )
        return country_supported and native_level in self.native_levels


@dataclass(frozen=True)
class BoundarySourceRecommendation:
    country_code: str
    native_level: str
    recommended_source_key: str
    candidate_source_keys: tuple[str, ...]
    requires_confirmation: bool = True


@dataclass(frozen=True)
class BoundaryDatasetSelection:
    country_code: str
    source_key: str
    source_version: str
    native_level: str
    target_level: str
    artifact_uri: str
    artifact_checksum: str
    license_name: str
    selected_by: str
    transform_id: str | None = None

    @property
    def selection_id(self) -> str:
        payload = asdict(self)
        encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode(
            "utf-8"
        )
        return hashlib.sha256(encoded).hexdigest()


@dataclass(frozen=True)
class ModelAreaDefinition:
    name: str
    geography_level: str
    country_code: str


@dataclass(frozen=True)
class ModelAreaBoundaryMapping:
    model_area_name: str
    admin_unit_code: str
    admin_unit_level: str
    boundary_selection_id: str
