from __future__ import annotations

import enum
from datetime import date, datetime

from sqlalchemy import (
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
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
    sample = "sample"


class Geography(Base):
    __tablename__ = "geography"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    country: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)

    admin_units: Mapped[list[AdminUnit]] = relationship(back_populates="geography")


class AdminUnit(Base):
    __tablename__ = "admin_unit"

    id: Mapped[int] = mapped_column(primary_key=True)
    geography_id: Mapped[int] = mapped_column(
        ForeignKey("geography.id"), nullable=False
    )
    level: Mapped[str] = mapped_column(String(32), nullable=False)
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    bbox_north: Mapped[float | None] = mapped_column(Float)
    bbox_west: Mapped[float | None] = mapped_column(Float)
    bbox_south: Mapped[float | None] = mapped_column(Float)
    bbox_east: Mapped[float | None] = mapped_column(Float)
    note: Mapped[str | None] = mapped_column(Text)

    geography: Mapped[Geography] = relationship(back_populates="admin_units")
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
    cadence: Mapped[str | None] = mapped_column(String(64))
    geography_id: Mapped[int | None] = mapped_column(ForeignKey("geography.id"))
    last_refreshed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    climate_runs: Mapped[list[ClimateRun]] = relationship(back_populates="data_source")


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
    input_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    scenario: Mapped[str | None] = mapped_column(String(64))
    resolution: Mapped[str | None] = mapped_column(String(64))
    data_label: Mapped[DataLabel] = mapped_column(Enum(DataLabel), nullable=False)
    window_start_year: Mapped[int | None] = mapped_column()
    window_end_year: Mapped[int | None] = mapped_column()
    generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

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
    )


class PredictionRequestRecord(Base):
    __tablename__ = "prediction_request"

    id: Mapped[int] = mapped_column(primary_key=True)
    request_key: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    location_slug: Mapped[str] = mapped_column(String(64), nullable=False)
    timeframe_id: Mapped[str] = mapped_column(String(64), nullable=False)
    end_month: Mapped[str | None] = mapped_column(String(7))
    request_payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="queued")
    stage: Mapped[str] = mapped_column(String(32), nullable=False, default="queued")
    attempt_count: Mapped[int] = mapped_column(nullable=False, default=1)
    dagster_run_id: Mapped[str | None] = mapped_column(String(64))
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
        Index("ix_prediction_request_status_created", "status", "created_at"),
    )
