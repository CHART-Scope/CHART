from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

PregnancyWindow = Literal[1, 2, 3]


class ModelFileSpec(BaseModel):
    filename: str = Field(min_length=1)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")


class ModelAreaSpec(BaseModel):
    place_code: str = Field(min_length=1)
    model_file: str = Field(min_length=1)
    model_area_name: str = Field(min_length=1)
    validated_pregnancy_windows: tuple[PregnancyWindow, ...] = (1, 2, 3)

    @model_validator(mode="after")
    def validate_windows(self) -> ModelAreaSpec:
        if not self.validated_pregnancy_windows or len(
            set(self.validated_pregnancy_windows)
        ) != len(self.validated_pregnancy_windows):
            raise ValueError("MODEL_RELEASE_PREGNANCY_WINDOWS_INVALID")
        return self


class ModelReleaseSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    module: str = Field(min_length=1)
    outcome: str = Field(min_length=1)
    version: str = Field(min_length=1)
    base_uri: str = Field(min_length=1)
    temperature_input: str = Field(min_length=1)
    months_required: int = Field(default=3, ge=1)
    release_notes: str | None = None
    source_git_ref: str | None = None
    model_files: list[ModelFileSpec] = Field(min_length=1)
    areas: list[ModelAreaSpec] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_release(self) -> ModelReleaseSpec:
        if self.months_required != 3:
            raise ValueError("MODEL_RELEASE_MONTHS_MUST_EQUAL_THREE")
        filenames = [item.filename for item in self.model_files]
        if len(filenames) != len(set(filenames)):
            raise ValueError("MODEL_RELEASE_FILE_DUPLICATE")
        place_codes = [item.place_code for item in self.areas]
        if len(place_codes) != len(set(place_codes)):
            raise ValueError("MODEL_RELEASE_PLACE_DUPLICATE")
        missing = sorted({item.model_file for item in self.areas} - set(filenames))
        if missing:
            raise ValueError(f"MODEL_RELEASE_FILE_UNKNOWN: {missing}")
        return self
