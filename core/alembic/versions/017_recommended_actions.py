"""add recommended_action table

Revision ID: 017_recommended_actions
Revises: 016_health_impact_spine
Create Date: 2026-08-03

Adds the durable seed target for reviewed interventions. Onboarding
populates rows from ``chart/solution_repository/seed.json``; later a
scheduler or an external API will refresh the rows in place. Slug is the
natural key that survives that refresh.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "017_recommended_actions"
down_revision = "016_health_impact_spine"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "recommended_action",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("slug", sa.String(length=160), nullable=False),
        sa.Column("source_record_id", sa.String(length=64)),
        sa.Column("title", sa.String(length=256), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column(
            "climate_hazards",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "solution_types",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("cost_of_implementation", sa.String(length=32)),
        sa.Column(
            "useful_links",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "case_studies",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "source",
            sa.String(length=32),
            nullable=False,
            server_default="seed",
        ),
        sa.Column(
            "synced_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
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
        sa.UniqueConstraint("slug", name="uq_recommended_action_slug"),
    )


def downgrade() -> None:
    op.drop_table("recommended_action")
