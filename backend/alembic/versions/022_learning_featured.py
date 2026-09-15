"""add is_featured to learning_resource

Revision ID: 022_learning_featured
Revises: 021_learning_health_outcomes
Create Date: 2026-09-14

The Learning hub opens with the hand-picked shortlist rather than the whole
catalogue. The rest stays seeded and reachable through the API so widening it
later is a flag, not a re-ingest.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "022_learning_featured"
down_revision = "021_learning_health_outcomes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "learning_resource",
        sa.Column(
            "is_featured",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.create_index(
        "ix_learning_resource_featured",
        "learning_resource",
        ["is_featured", "sort_weight"],
    )


def downgrade() -> None:
    op.drop_index("ix_learning_resource_featured", table_name="learning_resource")
    op.drop_column("learning_resource", "is_featured")
