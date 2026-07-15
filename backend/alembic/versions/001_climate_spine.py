"""climate spine tables for observed ERA5 ingestion

Revision ID: 001_climate_spine
Revises:
Create Date: 2026-07-15
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "001_climate_spine"
down_revision = None
branch_labels = None
depends_on = None

data_label = postgresql.ENUM(
    "modeled",
    "observed",
    "reanalysis",
    "sample",
    name="data_label",
    create_type=False,
)


def upgrade() -> None:
    data_label.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "geography",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("slug", sa.String(length=64), nullable=False),
        sa.Column("country", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.UniqueConstraint("slug"),
    )
    op.create_table(
        "admin_unit",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "geography_id", sa.Integer(), sa.ForeignKey("geography.id"), nullable=False
        ),
        sa.Column("level", sa.String(length=32), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("bbox_north", sa.Float()),
        sa.Column("bbox_west", sa.Float()),
        sa.Column("bbox_south", sa.Float()),
        sa.Column("bbox_east", sa.Float()),
        sa.Column("note", sa.Text()),
        sa.UniqueConstraint(
            "geography_id", "code", name="uq_admin_unit_geography_code"
        ),
    )
    op.create_table(
        "data_source",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("kind", sa.String(length=64), nullable=False),
        sa.Column("cadence", sa.String(length=64)),
        sa.Column("geography_id", sa.Integer(), sa.ForeignKey("geography.id")),
    )
    op.create_table(
        "provenance",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source_uri", sa.Text(), nullable=False),
        sa.Column("input_hash", sa.String(length=64), nullable=False),
        sa.Column("git_commit", sa.String(length=64)),
        sa.Column("license", sa.String(length=128)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_table(
        "climate_run",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "data_source_id",
            sa.Integer(),
            sa.ForeignKey("data_source.id"),
            nullable=False,
        ),
        sa.Column(
            "provenance_id",
            sa.Integer(),
            sa.ForeignKey("provenance.id"),
            nullable=False,
        ),
        sa.Column("tier", sa.String(length=32), nullable=False),
        sa.Column("input_hash", sa.String(length=64), nullable=False),
        sa.Column("scenario", sa.String(length=64)),
        sa.Column("resolution", sa.String(length=64)),
        sa.Column("data_label", data_label, nullable=False),
        sa.Column("window_start_year", sa.Integer()),
        sa.Column("window_end_year", sa.Integer()),
        sa.Column("generated_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("input_hash"),
    )
    op.create_table(
        "district_climate",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "admin_unit_id",
            sa.Integer(),
            sa.ForeignKey("admin_unit.id"),
            nullable=False,
        ),
        sa.Column(
            "climate_run_id",
            sa.Integer(),
            sa.ForeignKey("climate_run.id"),
            nullable=False,
        ),
        sa.Column("period_month", sa.Date(), nullable=False),
        sa.Column("variable", sa.String(length=64), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("agg_method", sa.String(length=64), nullable=False),
        sa.Column("unit", sa.String(length=32)),
        sa.UniqueConstraint(
            "admin_unit_id",
            "climate_run_id",
            "period_month",
            "variable",
            name="uq_district_climate_grain",
        ),
    )
    op.create_index(
        "ix_district_climate_admin_period",
        "district_climate",
        ["admin_unit_id", "period_month"],
    )


def downgrade() -> None:
    op.drop_index("ix_district_climate_admin_period", table_name="district_climate")
    op.drop_table("district_climate")
    op.drop_table("climate_run")
    op.drop_table("provenance")
    op.drop_table("data_source")
    op.drop_table("admin_unit")
    op.drop_table("geography")
    data_label.drop(op.get_bind(), checkfirst=True)
