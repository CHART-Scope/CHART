"""add durable prediction requests for on-demand Dagster runs

Revision ID: 003_prediction_requests
Revises: 002_data_source_last_refreshed
Create Date: 2026-07-15
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "003_prediction_requests"
down_revision = "002_data_source_last_refreshed"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "prediction_request",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("request_key", sa.String(length=64), nullable=False),
        sa.Column("location_slug", sa.String(length=64), nullable=False),
        sa.Column("timeframe_id", sa.String(length=64), nullable=False),
        sa.Column("end_month", sa.String(length=7)),
        sa.Column("request_payload", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column(
            "stage",
            sa.String(length=32),
            nullable=False,
            server_default="queued",
        ),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("dagster_run_id", sa.String(length=64)),
        sa.Column("climate_run_id", sa.Integer(), sa.ForeignKey("climate_run.id")),
        sa.Column("result_payload", sa.JSON()),
        sa.Column("error_code", sa.String(length=128)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("request_key"),
    )
    op.create_index(
        "ix_prediction_request_status_created",
        "prediction_request",
        ["status", "created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_prediction_request_status_created",
        table_name="prediction_request",
    )
    op.drop_table("prediction_request")
