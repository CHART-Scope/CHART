"""add climate_hazard and health_domain columns to model_release

Revision ID: 019_model_release_taxonomy
Revises: 018_audit_event
Create Date: 2026-08-03

Persist the taxonomy fields shipped in the model release manifest so the
planning UI can render hazard/outcome dropdowns straight from active
releases (no client-side lookup table). Nullable to keep older releases
that were registered before this column existed valid.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "019_model_release_taxonomy"
down_revision = "018_audit_event"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "model_release",
        sa.Column("climate_hazard", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "model_release",
        sa.Column("health_domain", sa.String(length=64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("model_release", "health_domain")
    op.drop_column("model_release", "climate_hazard")
