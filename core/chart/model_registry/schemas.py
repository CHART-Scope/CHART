from __future__ import annotations

from typing import Any, Literal

from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

PregnancyWindow = Literal[1, 2, 3]


class ModelFileSpec(BaseModel):
    filename: str = Field(min_length=1)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")

    @field_validator("filename")
    @classmethod
    def validate_filename(cls, value: str) -> str:
        if Path(value).name != value:
            raise ValueError("MODEL_RELEASE_FILENAME_INVALID")
        return value


class GeographyLevelSpec(BaseModel):
    key: str = Field(min_length=1)
    label: str = Field(min_length=1)
    sort_order: int = 0


class GeographyPlaceSpec(BaseModel):
    place_code: str = Field(min_length=1)
    country_code: str = Field(pattern=r"^[A-Z]{2}$")
    level: str = Field(min_length=1)
    display_name: str = Field(min_length=1)
    geography_id: str = Field(min_length=1)
    app_level: str = Field(min_length=1)
    level_label: str = Field(min_length=1)
    parent_place_code: str | None = None
    path: str = Field(pattern=r"^/")
    sort_order: int = 0
    boundary_key: str = Field(min_length=1)


class ReleaseGeographySpec(BaseModel):
    country_code: str = Field(pattern=r"^[A-Z]{2}$")
    country_name: str = Field(min_length=1)
    root_id: str = Field(min_length=1)
    root_path: str = Field(pattern=r"^/[^/]+$")
    analytics_slug: str = Field(min_length=1)
    boundary_artifact: str | None = None
    levels: list[GeographyLevelSpec] = Field(min_length=1)
    places: list[GeographyPlaceSpec] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_hierarchy(self) -> ReleaseGeographySpec:
        if self.country_code != self.country_code.upper():
            raise ValueError("MODEL_RELEASE_GEOGRAPHY_COUNTRY_CODE_INVALID")
        levels_by_key = {level.key: level for level in self.levels}
        if len(levels_by_key) != len(self.levels):
            raise ValueError("MODEL_RELEASE_GEOGRAPHY_LEVEL_DUPLICATE")
        if len({level.label for level in self.levels}) != len(self.levels):
            raise ValueError("MODEL_RELEASE_GEOGRAPHY_LEVEL_LABEL_DUPLICATE")

        places_by_code = {place.place_code: place for place in self.places}
        if len(places_by_code) != len(self.places):
            raise ValueError("MODEL_RELEASE_GEOGRAPHY_PLACE_DUPLICATE")
        for attribute, code in (
            ("geography_id", "MODEL_RELEASE_GEOGRAPHY_ID_DUPLICATE"),
            ("path", "MODEL_RELEASE_GEOGRAPHY_PATH_DUPLICATE"),
            ("boundary_key", "MODEL_RELEASE_GEOGRAPHY_BOUNDARY_DUPLICATE"),
        ):
            values = [getattr(place, attribute) for place in self.places]
            if len(values) != len(set(values)):
                raise ValueError(code)

        for place in self.places:
            if place.country_code != self.country_code:
                raise ValueError("MODEL_RELEASE_GEOGRAPHY_COUNTRY_MISMATCH")
            level = levels_by_key.get(place.app_level)
            if level is None:
                raise ValueError("MODEL_RELEASE_GEOGRAPHY_LEVEL_UNKNOWN")
            if place.level_label != level.label:
                raise ValueError("MODEL_RELEASE_GEOGRAPHY_LEVEL_LABEL_MISMATCH")
            if not place.path.startswith(f"{self.root_path}/"):
                raise ValueError("MODEL_RELEASE_GEOGRAPHY_PATH_OUTSIDE_ROOT")
            if (
                place.parent_place_code is not None
                and place.parent_place_code not in places_by_code
            ):
                raise ValueError("MODEL_RELEASE_GEOGRAPHY_PARENT_UNKNOWN")

        for place in self.places:
            visited = {place.place_code}
            parent_code = place.parent_place_code
            while parent_code is not None:
                if parent_code in visited:
                    raise ValueError("MODEL_RELEASE_GEOGRAPHY_PARENT_CYCLE")
                visited.add(parent_code)
                parent_code = places_by_code[parent_code].parent_place_code
        return self


class PlaceSetReferenceSpec(BaseModel):
    id: str = Field(min_length=1)
    version: str = Field(min_length=1)
    path: str = Field(min_length=1)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")

    @field_validator("path")
    @classmethod
    def validate_path(cls, value: str) -> str:
        path = Path(value)
        if path.is_absolute() or ".." in path.parts:
            raise ValueError("MODEL_RELEASE_PLACE_SET_PATH_INVALID")
        return value


class PlaceSetShapeSpec(BaseModel):
    path: str = Field(min_length=1)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")

    @field_validator("path")
    @classmethod
    def validate_path(cls, value: str) -> str:
        path = Path(value)
        if path.is_absolute() or ".." in path.parts:
            raise ValueError("PLACE_SET_SHAPE_PATH_INVALID")
        return value


class PlaceSetProvenanceSpec(BaseModel):
    source: str = Field(min_length=1)
    licence: str = Field(min_length=1)
    transform_id: str = Field(min_length=1)
    source_artifacts: list[ModelFileSpec] = Field(min_length=1)


class PlaceSetSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1] = 1
    id: str = Field(min_length=1)
    version: str = Field(min_length=1)
    geography: ReleaseGeographySpec
    shape: PlaceSetShapeSpec | None = None
    provenance: PlaceSetProvenanceSpec


class ModelRuntimeSpec(BaseModel):
    adapter: str = Field(min_length=1)
    artifact_type: str = Field(min_length=1)


class ModelVisualizationSpec(BaseModel):
    kind: Literal["odds_ratio_icon_array"]
    figure: Literal["newborn", "baby", "mother-baby"]
    context_figure: Literal["pregnant-woman", "baby"]


class ModelPresentationSpec(BaseModel):
    climate_hazard_label: str = Field(min_length=1)
    health_domain_label: str = Field(min_length=1)
    outcome_label: str = Field(min_length=1)
    dashboard_title: str = Field(min_length=1)
    population_label: str = Field(min_length=1)
    model_scope_label: str = Field(default="model", min_length=1)
    visualization: ModelVisualizationSpec | None = None
    risk_description: str | None = Field(default=None, min_length=1)
    # Overrides the anchor the runtime uses when computing odds ratios.
    # When set, the backend passes ``ref`` to the R adapter so every block
    # re-anchors at this temperature via ``dlnm::crosspred`` — the point
    # estimate and CI are genuinely relative to it rather than to the
    # per-block MMT baked into the compact artifact. Leave unset to keep
    # the modeller's bundled reference (e.g. climate-zone models where a
    # single fixed anchor across zones is not defensible).
    editorial_reference_temperature_c: float | None = Field(default=None, ge=-50, le=60)


class ModelAreaSpec(BaseModel):
    place_code: str = Field(min_length=1)
    country_code: str | None = None
    level: str | None = None
    model_file: str = Field(min_length=1)
    model_area_name: str = Field(min_length=1)
    validated_pregnancy_windows: tuple[PregnancyWindow, ...] | None = None
    display_name: str | None = None
    geography_id: str | None = None
    app_level: str | None = None
    level_label: str | None = None
    parent_place_code: str | None = None
    path: str | None = None
    sort_order: int = 0
    boundary_key: str | None = None

    @model_validator(mode="after")
    def validate_windows(self) -> ModelAreaSpec:
        if self.validated_pregnancy_windows is not None and (
            not self.validated_pregnancy_windows
            or len(set(self.validated_pregnancy_windows))
            != len(self.validated_pregnancy_windows)
        ):
            raise ValueError("MODEL_RELEASE_PREGNANCY_WINDOWS_INVALID")
        return self


class ModelReleaseSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1, 2] = 1
    id: str = Field(min_length=1)
    module: str = Field(min_length=1)
    outcome: str = Field(min_length=1)
    climate_hazard: str | None = None
    health_domain: str | None = None
    version: str = Field(min_length=1)
    base_uri: str = Field(min_length=1)
    runtime: ModelRuntimeSpec | None = None
    input_contract: dict[str, Any] | None = None
    output_contract: dict[str, Any] | None = None
    presentation: ModelPresentationSpec | None = None
    # Backwards-compatible fields for older temperature releases. New model
    # families should use input_contract instead.
    temperature_input: str | None = Field(default=None, min_length=1)
    months_required: int | None = Field(default=None, ge=1)
    release_notes: str | None = None
    source_git_ref: str | None = None
    model_files: list[ModelFileSpec] = Field(min_length=1)
    geography: ReleaseGeographySpec | None = None
    place_set: PlaceSetReferenceSpec | None = None
    areas: list[ModelAreaSpec] = Field(default_factory=list)
    coverage: list[ModelAreaSpec] | None = None

    @model_validator(mode="after")
    def validate_release(self) -> ModelReleaseSpec:
        if self.schema_version == 1:
            if (
                not self.areas
                or self.coverage is not None
                or self.place_set is not None
            ):
                raise ValueError("MODEL_RELEASE_V1_AREAS_REQUIRED")
        else:
            if (
                self.place_set is None
                or self.geography is not None
                or self.areas
                or not self.coverage
            ):
                raise ValueError("MODEL_RELEASE_V2_PLACE_SET_AND_COVERAGE_REQUIRED")
            self.areas = list(self.coverage)
        if self.input_contract is None and self.temperature_input is None:
            raise ValueError("MODEL_RELEASE_INPUT_CONTRACT_REQUIRED")
        supersedes = (self.input_contract or {}).get("supersedes_release_ids", [])
        if not isinstance(supersedes, list) or any(
            not isinstance(item, str) or not item for item in supersedes
        ):
            raise ValueError("MODEL_RELEASE_SUPERSEDES_INVALID")
        if self.id in supersedes:
            raise ValueError("MODEL_RELEASE_CANNOT_SUPERSEDE_ITSELF")
        if len(supersedes) != len(set(supersedes)):
            raise ValueError("MODEL_RELEASE_SUPERSEDES_DUPLICATE")
        if self.temperature_input is not None and self.months_required != 3:
            raise ValueError("MODEL_RELEASE_MONTHS_MUST_EQUAL_THREE")
        if self.temperature_input is not None:
            # Compatibility for legacy LBW manifests. Generic input_contract
            # releases receive no pregnancy-window semantics by default.
            for area in self.areas:
                if area.validated_pregnancy_windows is None:
                    area.validated_pregnancy_windows = (1, 2, 3)
        filenames = [item.filename for item in self.model_files]
        if len(filenames) != len(set(filenames)):
            raise ValueError("MODEL_RELEASE_FILE_DUPLICATE")
        place_codes = [item.place_code for item in self.areas]
        if len(place_codes) != len(set(place_codes)):
            raise ValueError("MODEL_RELEASE_PLACE_DUPLICATE")
        missing = sorted({item.model_file for item in self.areas} - set(filenames))
        if missing:
            raise ValueError(f"MODEL_RELEASE_FILE_UNKNOWN: {missing}")
        if self.geography is not None:
            if not self.geography.places:
                self.geography.places = [
                    GeographyPlaceSpec(
                        place_code=area.place_code,
                        country_code=area.country_code or self.geography.country_code,
                        level=area.level or area.app_level or "area",
                        display_name=area.display_name or area.model_area_name,
                        geography_id=area.geography_id or area.place_code,
                        app_level=area.app_level or area.level or "area",
                        level_label=area.level_label or area.level or "Area",
                        parent_place_code=area.parent_place_code,
                        path=area.path
                        or f"{self.geography.root_path}/{area.place_code}",
                        sort_order=area.sort_order,
                        boundary_key=area.boundary_key or area.place_code,
                    )
                    for area in self.areas
                ]
            self.geography = ReleaseGeographySpec.model_validate(
                self.geography.model_dump()
            )
            level_keys = {level.key for level in self.geography.levels}
            geography_codes = {place.place_code for place in self.geography.places}
            if len(geography_codes) != len(self.geography.places):
                raise ValueError("MODEL_RELEASE_GEOGRAPHY_PLACE_DUPLICATE")
            if not set(place_codes).issubset(geography_codes):
                raise ValueError("MODEL_RELEASE_GEOGRAPHY_MAPPING_UNKNOWN")
            for place in self.geography.places:
                if place.app_level not in level_keys:
                    raise ValueError("MODEL_RELEASE_GEOGRAPHY_LEVEL_UNKNOWN")
                if (
                    place.parent_place_code is not None
                    and place.parent_place_code not in geography_codes
                ):
                    raise ValueError("MODEL_RELEASE_GEOGRAPHY_PARENT_UNKNOWN")
            places_by_code = {
                place.place_code: place for place in self.geography.places
            }
            for area in self.areas:
                place = places_by_code[area.place_code]
                if area.country_code is not None and (
                    area.country_code != self.geography.country_code
                ):
                    raise ValueError("MODEL_RELEASE_AREA_COUNTRY_MISMATCH")
                if area.level is not None and area.level != place.level:
                    raise ValueError("MODEL_RELEASE_AREA_LEVEL_MISMATCH")
        return self
