"""add health_outcomes to learning_resource

Revision ID: 021_learning_health_outcomes
Revises: 020_learning_hub
Create Date: 2026-09-14

Health outcome is the axis planners actually filter on, so it becomes a
first-class label array rather than being inferred from free text on every
read. Populated at ingest; empty for the large share of the catalogue that
is general climate-health, governance or funding material.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "021_learning_health_outcomes"
down_revision = "020_learning_hub"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "learning_resource",
        sa.Column(
            "health_outcomes",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("learning_resource", "health_outcomes")
