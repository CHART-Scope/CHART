"""track operator-triggered climate pulls, and let reset drop the newer tables

Revision ID: 025_climate_ingestion_job
Revises: 024_prediction_result
Create Date: 2026-09-18

Climate arrived only as a side effect of asking for a prediction, one
Copernicus request per area per month. Measured on the live system that is a
median 215s queue wait each, and asking for a country produced more work than
the workers could drain: 95 of 189 requests failed, 92 of them because their
lease expired before anything reached them.

Pulling a whole country at once needs somewhere to report progress from - the
web proxy times out after 15 seconds and a pull takes minutes - so this adds a
job row the UI can poll.

It also adds three deletes that `reset()` has been missing since the daily
grain and the results table landed: `district_climate_day`'s foreign keys
carry no ``ondelete``, so a reset would have failed against them once daily
rows existed.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "025_climate_ingestion_job"
down_revision = "024_prediction_result"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "climate_ingestion_job",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("country_code", sa.String(length=8), nullable=False),
        sa.Column(
            "months",
            sa.JSON().with_variant(sa.dialects.postgresql.JSONB(), "postgresql"),
            nullable=False,
            server_default="[]",
        ),
        sa.Column(
            "status",
            sa.String(length=16),
            nullable=False,
            server_default="queued",
        ),
        sa.Column(
            "stage",
            sa.String(length=32),
            nullable=False,
            server_default="queued",
        ),
        sa.Column("areas_total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("areas_done", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "climate_run_id",
            sa.Integer(),
            sa.ForeignKey("climate_run.id", ondelete="SET NULL"),
        ),
        sa.Column("requested_by_user_id", sa.String(length=128)),
        sa.Column("dagster_run_id", sa.String(length=64)),
        sa.Column("error_code", sa.String(length=128)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint(
            "status IN ('queued','running','completed','failed')",
            name="ck_climate_ingestion_job_status",
        ),
    )
    op.create_index(
        "ix_climate_ingestion_job_live",
        "climate_ingestion_job",
        ["country_code", "status"],
    )


def downgrade() -> None:
    op.drop_index("ix_climate_ingestion_job_live", table_name="climate_ingestion_job")
    op.drop_table("climate_ingestion_job")
