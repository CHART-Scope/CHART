from __future__ import annotations

import enum
from datetime import date, datetime

from geoalchemy2 import Geometry
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    JSON,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class DataLabel(str, enum.Enum):
    modeled = "modeled"
    observed = "observed"
    reanalysis = "reanalysis"
    forecast = "forecast"
    projection = "projection"
    sample = "sample"


class CountryGeoConfig(Base):
    """Country-specific display labels for the user-facing place hierarchy."""

    __tablename__ = "country_geo_config"

    country_code: Mapped[str] = mapped_column(String(8), primary_key=True)
    level_key: Mapped[str] = mapped_column(String(32), primary_key=True)
    level_label: Mapped[str] = mapped_column(String(64), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class AppGeography(Base):
    """The place selected by users in CHART."""

    __tablename__ = "geographies"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    country_code: Mapped[str] = mapped_column(String(8), nullable=False)
    level: Mapped[str] = mapped_column(String(32), nullable=False)
    level_label: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    parent_id: Mapped[str | None] = mapped_column(
        ForeignKey("geographies.id", ondelete="SET NULL")
    )
    external_code: Mapped[str | None] = mapped_column(String(128))
    path: Mapped[str] = mapped_column(String(512), nullable=False)
    sort_order: Mapped[int] = mapped_column(nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    admin_unit: Mapped[AdminUnit | None] = relationship(back_populates="app_geography")

    __table_args__ = (
        ForeignKeyConstraint(
            ["country_code", "level"],
            ["country_geo_config.country_code", "country_geo_config.level_key"],
            name="geographies_country_level_country_geo_config_fk",
            ondelete="RESTRICT",
        ),
        UniqueConstraint("path", name="geographies_path_unique"),
        Index("geographies_country_level_idx", "country_code", "level", "sort_order"),
        Index("geographies_parent_idx", "parent_id", "sort_order"),
    )


class Geography(Base):
    __tablename__ = "chart_geographies"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    country: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)

    admin_units: Mapped[list[AdminUnit]] = relationship(back_populates="geography")


class AppUser(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    username: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    email: Mapped[str | None] = mapped_column(String(256), unique=True)
    phone: Mapped[str | None] = mapped_column(String(64))
    display_name: Mapped[str] = mapped_column(String(256), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    identity_provider: Mapped[str] = mapped_column(
        String(64), nullable=False, default="keycloak"
    )
    created_by_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class UserRoleRecord(Base):
    __tablename__ = "user_roles"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    role: Mapped[str] = mapped_column(String(64), primary_key=True)
    source: Mapped[str] = mapped_column(String(64), nullable=False, default="keycloak")
    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class UserGeographyScopeRecord(Base):
    __tablename__ = "user_geography_scopes"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    geography_id: Mapped[str] = mapped_column(
        ForeignKey("geographies.id", ondelete="CASCADE"), nullable=False
    )
    source: Mapped[str] = mapped_column(String(64), nullable=False, default="keycloak")
    external_group_path: Mapped[str | None] = mapped_column(String(512))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "geography_id",
            "source",
            name="user_geography_scopes_user_geo_source_unique",
        ),
    )


class SetupStateRecord(Base):
    __tablename__ = "setup_state"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    completed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    phase: Mapped[str] = mapped_column(
        String(32), nullable=False, default="uninitialized"
    )
    provisioning_token: Mapped[str | None] = mapped_column(String(64))
    provisioning_request_hash: Mapped[str | None] = mapped_column(String(64))
    provisioning_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    last_error_code: Mapped[str | None] = mapped_column(String(128))
    country_code: Mapped[str | None] = mapped_column(String(8))
    country_name: Mapped[str | None] = mapped_column(String(128))
    root_geography_id: Mapped[str | None] = mapped_column(
        ForeignKey("geographies.id", ondelete="SET NULL")
    )
    first_admin_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    first_admin_email: Mapped[str | None] = mapped_column(String(256))
    selected_hazards: Mapped[list[dict]] = mapped_column(
        JSON, nullable=False, default=list
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class WorkspaceRecord(Base):
    __tablename__ = "workspaces"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    planning_cycle: Mapped[str | None] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    geography_id: Mapped[str | None] = mapped_column(
        ForeignKey("geographies.id", ondelete="SET NULL")
    )
    created_by_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    owner_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class WorkspaceMemberRecord(Base):
    __tablename__ = "workspace_members"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint(
            "workspace_id",
            "user_id",
            name="workspace_members_workspace_user_unique",
        ),
    )


class AdminUnit(Base):
    __tablename__ = "admin_unit"

    id: Mapped[int] = mapped_column(primary_key=True)
    geography_id: Mapped[int] = mapped_column(
        ForeignKey("chart_geographies.id"), nullable=False
    )
    app_geography_id: Mapped[str | None] = mapped_column(
        ForeignKey("geographies.id", ondelete="SET NULL"), unique=True
    )
    level: Mapped[str] = mapped_column(String(32), nullable=False)
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    bbox_north: Mapped[float | None] = mapped_column(Float)
    bbox_west: Mapped[float | None] = mapped_column(Float)
    bbox_south: Mapped[float | None] = mapped_column(Float)
    bbox_east: Mapped[float | None] = mapped_column(Float)
    boundary: Mapped[str | None] = mapped_column(
        Text().with_variant(
            Geometry("MULTIPOLYGON", srid=4326, spatial_index=False), "postgresql"
        )
    )
    boundary_provenance: Mapped[dict | None] = mapped_column(JSON)
    boundary_version: Mapped[str | None] = mapped_column(String(128))
    note: Mapped[str | None] = mapped_column(Text)

    geography: Mapped[Geography] = relationship(back_populates="admin_units")
    app_geography: Mapped[AppGeography | None] = relationship(
        back_populates="admin_unit"
    )
    district_climate: Mapped[list[DistrictClimate]] = relationship(
        back_populates="admin_unit"
    )

    __table_args__ = (
        UniqueConstraint("geography_id", "code", name="uq_admin_unit_geography_code"),
    )


class DataSource(Base):
    __tablename__ = "data_source"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    kind: Mapped[str] = mapped_column(String(64), nullable=False)
    provider: Mapped[str | None] = mapped_column(String(128))
    product: Mapped[str | None] = mapped_column(String(128))
    version: Mapped[str | None] = mapped_column(String(128))
    access_method: Mapped[str | None] = mapped_column(String(64))
    source_uri: Mapped[str | None] = mapped_column(Text)
    license: Mapped[str | None] = mapped_column(String(256))
    cadence: Mapped[str | None] = mapped_column(String(64))
    geography_id: Mapped[int | None] = mapped_column(ForeignKey("chart_geographies.id"))
    last_refreshed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    climate_runs: Mapped[list[ClimateRun]] = relationship(back_populates="data_source")

    __table_args__ = (
        UniqueConstraint(
            "name",
            "geography_id",
            name="uq_data_source_name_geography",
        ),
    )


class Provenance(Base):
    __tablename__ = "provenance"

    id: Mapped[int] = mapped_column(primary_key=True)
    source_uri: Mapped[str] = mapped_column(Text, nullable=False)
    input_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    git_commit: Mapped[str | None] = mapped_column(String(64))
    license: Mapped[str | None] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    climate_runs: Mapped[list[ClimateRun]] = relationship(back_populates="provenance")


class ClimateRun(Base):
    __tablename__ = "climate_run"

    id: Mapped[int] = mapped_column(primary_key=True)
    data_source_id: Mapped[int] = mapped_column(
        ForeignKey("data_source.id"), nullable=False
    )
    provenance_id: Mapped[int] = mapped_column(
        ForeignKey("provenance.id"), nullable=False
    )
    tier: Mapped[str] = mapped_column(String(32), nullable=False)
    source_class: Mapped[str | None] = mapped_column(String(32))
    source_name: Mapped[str | None] = mapped_column(String(128))
    source_version: Mapped[str | None] = mapped_column(String(128))
    source_uri: Mapped[str | None] = mapped_column(Text)
    source_license: Mapped[str | None] = mapped_column(String(256))
    input_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    scenario: Mapped[str | None] = mapped_column(String(64))
    resolution: Mapped[str | None] = mapped_column(String(64))
    data_label: Mapped[DataLabel] = mapped_column(
        Enum(DataLabel, name="data_label"), nullable=False
    )
    window_start_year: Mapped[int | None] = mapped_column()
    window_end_year: Mapped[int | None] = mapped_column()
    generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    issue_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    valid_from: Mapped[date | None] = mapped_column(Date)
    valid_to: Mapped[date | None] = mapped_column(Date)
    fresh_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ensemble_summary: Mapped[str | None] = mapped_column(String(128))
    bias_adjustment: Mapped[str | None] = mapped_column(String(128))
    boundary_version: Mapped[str | None] = mapped_column(String(128))
    aggregation_version: Mapped[str | None] = mapped_column(String(128))
    downscaling_method: Mapped[str | None] = mapped_column(String(128))
    quality_status: Mapped[str | None] = mapped_column(String(32))
    raw_object_uri: Mapped[str | None] = mapped_column(Text)
    raw_object_hash: Mapped[str | None] = mapped_column(String(64))

    data_source: Mapped[DataSource] = relationship(back_populates="climate_runs")
    provenance: Mapped[Provenance] = relationship(back_populates="climate_runs")
    district_climate: Mapped[list[DistrictClimate]] = relationship(
        back_populates="climate_run"
    )


class DistrictClimate(Base):
    __tablename__ = "district_climate"

    id: Mapped[int] = mapped_column(primary_key=True)
    admin_unit_id: Mapped[int] = mapped_column(
        ForeignKey("admin_unit.id"), nullable=False
    )
    climate_run_id: Mapped[int] = mapped_column(
        ForeignKey("climate_run.id"), nullable=False
    )
    period_month: Mapped[date] = mapped_column(Date, nullable=False)
    variable: Mapped[str] = mapped_column(String(64), nullable=False)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    agg_method: Mapped[str] = mapped_column(
        String(64), nullable=False, default="bbox_mean"
    )
    unit: Mapped[str | None] = mapped_column(String(32))
    observed_days: Mapped[int | None] = mapped_column()
    expected_days: Mapped[int | None] = mapped_column()
    quality_status: Mapped[str | None] = mapped_column(String(32))
    record_hash: Mapped[str | None] = mapped_column(String(64))

    admin_unit: Mapped[AdminUnit] = relationship(back_populates="district_climate")
    climate_run: Mapped[ClimateRun] = relationship(back_populates="district_climate")

    __table_args__ = (
        UniqueConstraint(
            "admin_unit_id",
            "climate_run_id",
            "period_month",
            "variable",
            name="uq_district_climate_grain",
        ),
        Index("ix_district_climate_admin_period", "admin_unit_id", "period_month"),
        Index(
            "ix_district_climate_selection",
            "admin_unit_id",
            "period_month",
            "variable",
            "climate_run_id",
        ),
    )


class ModelRelease(Base):
    """One immutable, versioned model release supplied by a modelling team."""

    __tablename__ = "model_release"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    module: Mapped[str] = mapped_column(String(64), nullable=False)
    outcome: Mapped[str] = mapped_column(String(64), nullable=False)
    version: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="uploaded")
    model_files: Mapped[list[dict]] = mapped_column(JSON, nullable=False)
    input_spec: Mapped[dict] = mapped_column(JSON, nullable=False)
    release_notes: Mapped[str | None] = mapped_column(Text)
    source_git_ref: Mapped[str | None] = mapped_column(String(128))
    release_file_uri: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    area_mappings: Mapped[list[ModelAreaMapping]] = relationship(
        back_populates="model_release", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("module", "outcome", "version", name="uq_model_release"),
        Index("ix_model_release_status", "module", "outcome", "status"),
    )


class ModelAreaMapping(Base):
    """Connect a CHART place to the matching area inside a model file."""

    __tablename__ = "model_area_mapping"

    id: Mapped[int] = mapped_column(primary_key=True)
    model_release_id: Mapped[str] = mapped_column(
        ForeignKey("model_release.id", ondelete="CASCADE"), nullable=False
    )
    admin_unit_id: Mapped[int] = mapped_column(
        ForeignKey("admin_unit.id", ondelete="CASCADE"), nullable=False
    )
    model_area_key: Mapped[str] = mapped_column(String(128), nullable=False)
    model_file: Mapped[str] = mapped_column(String(256), nullable=False)
    validated_pregnancy_windows: Mapped[list[int]] = mapped_column(
        JSON, nullable=False, default=lambda: [1, 2, 3]
    )

    model_release: Mapped[ModelRelease] = relationship(back_populates="area_mappings")
    admin_unit: Mapped[AdminUnit] = relationship()

    __table_args__ = (
        UniqueConstraint(
            "model_release_id",
            "admin_unit_id",
            name="uq_model_area_release_admin",
        ),
    )


class ActiveModelAssignment(Base):
    """The active model release for one place and outcome."""

    __tablename__ = "active_model_assignment"

    admin_unit_id: Mapped[int] = mapped_column(
        ForeignKey("admin_unit.id", ondelete="CASCADE"), primary_key=True
    )
    module: Mapped[str] = mapped_column(String(64), primary_key=True)
    outcome: Mapped[str] = mapped_column(String(64), primary_key=True)
    model_release_id: Mapped[str] = mapped_column(
        ForeignKey("model_release.id", ondelete="CASCADE"), nullable=False
    )
    activated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_active_model_assignment_release", "model_release_id"),
    )


class ClimateInputWindowRecord(Base):
    """The exact three monthly values prepared for one model call."""

    __tablename__ = "climate_input_window"

    id: Mapped[int] = mapped_column(primary_key=True)
    admin_unit_id: Mapped[int] = mapped_column(
        ForeignKey("admin_unit.id"), nullable=False
    )
    target_end_month: Mapped[date] = mapped_column(Date, nullable=False)
    input_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    contract_version: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    months: Mapped[list[ClimateInputMonthRecord]] = relationship(
        back_populates="window", cascade="all, delete-orphan"
    )


class ClimateInputMonthRecord(Base):
    __tablename__ = "climate_input_month"

    id: Mapped[int] = mapped_column(primary_key=True)
    climate_input_window_id: Mapped[int] = mapped_column(
        ForeignKey("climate_input_window.id", ondelete="CASCADE"), nullable=False
    )
    district_climate_id: Mapped[int] = mapped_column(
        ForeignKey("district_climate.id"), nullable=False
    )
    lag_index: Mapped[int] = mapped_column(nullable=False)

    window: Mapped[ClimateInputWindowRecord] = relationship(back_populates="months")
    climate_value: Mapped[DistrictClimate] = relationship()

    __table_args__ = (
        UniqueConstraint(
            "climate_input_window_id",
            "lag_index",
            name="uq_climate_input_window_lag",
        ),
        UniqueConstraint(
            "climate_input_window_id",
            "district_climate_id",
            name="uq_climate_input_window_value",
        ),
    )


class PredictionRequestRecord(Base):
    __tablename__ = "prediction_request"

    id: Mapped[int] = mapped_column(primary_key=True)
    request_key: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    location_slug: Mapped[str] = mapped_column(String(64), nullable=False)
    timeframe_id: Mapped[str] = mapped_column(String(64), nullable=False)
    end_month: Mapped[str | None] = mapped_column(String(7))
    admin_unit_id: Mapped[int | None] = mapped_column(ForeignKey("admin_unit.id"))
    planning_date: Mapped[date | None] = mapped_column(Date)
    climate_input_window_id: Mapped[int | None] = mapped_column(
        ForeignKey("climate_input_window.id")
    )
    model_release_id: Mapped[str | None] = mapped_column(ForeignKey("model_release.id"))
    model_artifact_sha256: Mapped[str | None] = mapped_column(String(64))
    requested_by_user_id: Mapped[str | None] = mapped_column(String(128))
    available_from: Mapped[date | None] = mapped_column(Date)
    pipeline_version: Mapped[str | None] = mapped_column(String(64))
    request_payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    source_as_of_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="queued")
    stage: Mapped[str] = mapped_column(String(32), nullable=False, default="queued")
    attempt_count: Mapped[int] = mapped_column(nullable=False, default=1)
    dagster_run_id: Mapped[str | None] = mapped_column(String(64))
    lease_token: Mapped[str | None] = mapped_column(String(64))
    lease_owner: Mapped[str | None] = mapped_column(String(128))
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    climate_run_id: Mapped[int | None] = mapped_column(ForeignKey("climate_run.id"))
    result_payload: Mapped[dict | None] = mapped_column(JSON)
    error_code: Mapped[str | None] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint(
            "status IN ('waiting', 'queued', 'running', 'completed', 'failed')",
            name="ck_prediction_request_status",
        ),
        CheckConstraint(
            "stage IN ('waiting_for_data', 'queued', 'preparing_climate', "
            "'climate_ready', 'predicting', 'completed', 'failed')",
            name="ck_prediction_request_stage",
        ),
        Index("ix_prediction_request_status_created", "status", "created_at"),
        Index(
            "ix_prediction_request_lease",
            "status",
            "lease_expires_at",
            "next_attempt_at",
        ),
        Index(
            "ix_prediction_request_waiting_available",
            "status",
            "available_from",
        ),
        Index(
            "ix_prediction_request_user_location_created",
            "requested_by_user_id",
            "location_slug",
            "created_at",
        ),
    )


class IngestionLeaseRecord(Base):
    """Single-flight ownership for one immutable provider acquisition."""

    __tablename__ = "ingestion_lease"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="running")
    owner_token: Mapped[str] = mapped_column(String(64), nullable=False)
    lease_expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    attempt_count: Mapped[int] = mapped_column(nullable=False, default=1)
    result_climate_run_id: Mapped[int | None] = mapped_column(
        ForeignKey("climate_run.id", ondelete="SET NULL")
    )
    error_code: Mapped[str | None] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('running', 'completed', 'failed')",
            name="ck_ingestion_lease_status",
        ),
        Index("ix_ingestion_lease_status_expiry", "status", "lease_expires_at"),
    )
