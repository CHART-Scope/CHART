"""set server defaults on status/agg_method columns

Revision ID: 012_status_server_defaults
Revises: 011_validated_model_windows
Create Date: 2026-07-23
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "012_status_server_defaults"
down_revision: str | None = "011_validated_model_windows"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Alembic defaults to varchar(32); longer revision ids fail on version stamp.
    op.execute(
        "ALTER TABLE alembic_version "
        "ALTER COLUMN version_num TYPE VARCHAR(64)"
    )
    op.alter_column(
        "prediction_request", "status", server_default="queued"
    )
    op.alter_column(
        "district_climate", "agg_method", server_default="bbox_mean"
    )
    op.alter_column(
        "model_release", "status", server_default="uploaded"
    )


def downgrade() -> None:
    op.alter_column("model_release", "status", server_default=None)
    op.alter_column("district_climate", "agg_method", server_default=None)
    op.alter_column("prediction_request", "status", server_default=None)
