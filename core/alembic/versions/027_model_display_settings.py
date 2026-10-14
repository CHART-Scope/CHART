"""add model_display_setting table

Revision ID: 027_model_display_settings
Revises: 026_prediction_sample_size
Create Date: 2026-10-13

One row per country and outcome narrowing which pregnancy windows or age
groups, scenarios and data modes CHART offers. No row means the defaults, so
existing installations keep their behaviour until someone saves a setting.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "027_model_display_settings"
down_revision = "026_prediction_sample_size"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "model_display_setting",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("country_code", sa.String(length=8), nullable=False),
        sa.Column("outcome", sa.String(length=64), nullable=False),
        sa.Column("settings", postgresql.JSONB(), nullable=False),
        sa.Column(
            "updated_by_user_id",
            sa.String(length=128),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "country_code",
            "outcome",
            name="uq_model_display_setting_country_outcome",
        ),
    )


def downgrade() -> None:
    op.drop_table("model_display_setting")
