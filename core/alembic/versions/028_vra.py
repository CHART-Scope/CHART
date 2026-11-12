"""add vulnerability and resilience assessment (VRA) tables

Revision ID: 028_vra
Revises: 027_model_display_settings
Create Date: 2026-10-22

The VRA scores the child areas of a frame geography (a state's divisions, a
country's counties) on hazard, exposure, sensitivity and adaptive capacity.
It keeps its own tables rather than reusing ``covariate``, which has no
component, direction or vintage:

- ``vra_indicator``: the catalogue, synced from ``chart/vra/catalogue.json``.
- ``vra_indicator_value``: one value per indicator, area and vintage, with its
  source, so re-uploads and refreshes are upserts.
- ``vra_ingestion``: one checked CSV upload, with row-level rejections.
- ``vra_run`` / ``vra_result`` / ``vra_result_indicator``: one scoring run, its
  parameters and bounds, and per-area and per-indicator results, so any run
  can be reproduced and explained.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "028_vra"
down_revision = "027_model_display_settings"
branch_labels = None
depends_on = None


def _created_at() -> sa.Column:
    return sa.Column(
        "created_at",
        sa.DateTime(timezone=True),
        server_default=sa.text("now()"),
        nullable=False,
    )


def upgrade() -> None:
    op.create_table(
        "vra_indicator",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(length=64), nullable=False, unique=True),
        sa.Column("component", sa.String(length=32), nullable=False),
        sa.Column("category", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=256), nullable=False),
        sa.Column("unit", sa.String(length=64), nullable=False),
        sa.Column("direction_to_risk", sa.Integer(), nullable=False),
        sa.Column("route", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("rationale", sa.Text(), nullable=False),
        sa.Column("ceew_ref", sa.String(length=64)),
        sa.Column("catalogue_version", sa.String(length=64), nullable=False),
        sa.Column(
            "synced_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "component IN ('hazard','exposure','sensitivity','adaptive_capacity')",
            name="ck_vra_indicator_component",
        ),
        sa.CheckConstraint(
            "direction_to_risk IN (-1, 1)", name="ck_vra_indicator_direction"
        ),
        sa.CheckConstraint(
            "route IN ('computed','upload','manual','pull')",
            name="ck_vra_indicator_route",
        ),
        sa.CheckConstraint(
            "status IN ('included','context','dropped')",
            name="ck_vra_indicator_status",
        ),
    )
    op.create_table(
        "vra_ingestion",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "frame_geography_id",
            sa.String(length=128),
            sa.ForeignKey("geographies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("route", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("file_name", sa.String(length=256)),
        sa.Column("file_sha256", sa.String(length=64), nullable=False),
        sa.Column("rows_accepted", sa.Integer(), nullable=False),
        sa.Column("rows_rejected", sa.Integer(), nullable=False),
        sa.Column("rejections", postgresql.JSONB(), nullable=False),
        sa.Column("requested_by", sa.String(length=128)),
        _created_at(),
        sa.CheckConstraint(
            "status IN ('completed','failed')", name="ck_vra_ingestion_status"
        ),
    )
    op.create_index(
        "ix_vra_ingestion_frame", "vra_ingestion", ["frame_geography_id", "id"]
    )
    op.create_table(
        "vra_indicator_value",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "indicator_id",
            sa.Integer(),
            sa.ForeignKey("vra_indicator.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "admin_unit_id",
            sa.Integer(),
            sa.ForeignKey("admin_unit.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("vintage", sa.String(length=32), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("method", sa.String(length=32), nullable=False),
        sa.Column("quality_flags", postgresql.JSONB(), nullable=False),
        sa.Column("source_name", sa.String(length=256)),
        sa.Column("source_url", sa.Text()),
        sa.Column("notes", sa.Text()),
        sa.Column(
            "ingestion_id",
            sa.Integer(),
            sa.ForeignKey("vra_ingestion.id", ondelete="SET NULL"),
        ),
        sa.Column(
            "climate_run_id",
            sa.Integer(),
            sa.ForeignKey("climate_run.id", ondelete="SET NULL"),
        ),
        _created_at(),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "indicator_id",
            "admin_unit_id",
            "vintage",
            name="uq_vra_indicator_value_grain",
        ),
    )
    op.create_index(
        "ix_vra_indicator_value_admin_unit", "vra_indicator_value", ["admin_unit_id"]
    )
    op.create_table(
        "vra_run",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "frame_geography_id",
            sa.String(length=128),
            sa.ForeignKey("geographies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("method_version", sa.String(length=32), nullable=False),
        sa.Column("catalogue_version", sa.String(length=64), nullable=False),
        sa.Column("params", postgresql.JSONB(), nullable=False),
        sa.Column("input_hash", sa.String(length=64), nullable=False),
        sa.Column("output_hash", sa.String(length=64), nullable=False),
        sa.Column("created_by", sa.String(length=128)),
        _created_at(),
    )
    op.create_index("ix_vra_run_frame", "vra_run", ["frame_geography_id", "id"])
    op.create_table(
        "vra_result",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "run_id",
            sa.Integer(),
            sa.ForeignKey("vra_run.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "admin_unit_id",
            sa.Integer(),
            sa.ForeignKey("admin_unit.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("hazard", sa.Float()),
        sa.Column("exposure", sa.Float()),
        sa.Column("sensitivity", sa.Float()),
        sa.Column("adaptive_capacity", sa.Float()),
        sa.Column("vulnerability", sa.Float()),
        sa.Column("risk", sa.Float()),
        sa.Column("risk_class", sa.String(length=16)),
        sa.Column("rank", sa.Integer()),
        sa.Column("missing_reason", sa.String(length=32)),
        sa.Column("coverage", postgresql.JSONB(), nullable=False),
        sa.Column("drivers", postgresql.JSONB(), nullable=False),
        sa.UniqueConstraint("run_id", "admin_unit_id", name="uq_vra_result_area"),
    )
    op.create_table(
        "vra_result_indicator",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "run_id",
            sa.Integer(),
            sa.ForeignKey("vra_run.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "admin_unit_id",
            sa.Integer(),
            sa.ForeignKey("admin_unit.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "indicator_id",
            sa.Integer(),
            sa.ForeignKey("vra_indicator.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "value_id",
            sa.Integer(),
            sa.ForeignKey("vra_indicator_value.id", ondelete="SET NULL"),
        ),
        sa.Column("vintage", sa.String(length=32)),
        sa.Column("raw", sa.Float()),
        sa.Column("normalised", sa.Float()),
        sa.Column("weight", sa.Float()),
        sa.Column("contribution", sa.Float()),
        sa.Column("excluded_reason", sa.String(length=32)),
        sa.UniqueConstraint(
            "run_id",
            "admin_unit_id",
            "indicator_id",
            name="uq_vra_result_indicator_grain",
        ),
    )


def downgrade() -> None:
    op.drop_table("vra_result_indicator")
    op.drop_table("vra_result")
    op.drop_index("ix_vra_run_frame", table_name="vra_run")
    op.drop_table("vra_run")
    op.drop_index("ix_vra_indicator_value_admin_unit", table_name="vra_indicator_value")
    op.drop_table("vra_indicator_value")
    op.drop_index("ix_vra_ingestion_frame", table_name="vra_ingestion")
    op.drop_table("vra_ingestion")
    op.drop_table("vra_indicator")
