"""store fitted-sample counts with durable prediction results

Revision ID: 026_prediction_sample_size
Revises: 025_climate_ingestion_job
Create Date: 2026-09-25
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "026_prediction_sample_size"
down_revision = "025_climate_ingestion_job"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("prediction_result", sa.Column("n_training", sa.Integer()))
    op.add_column("prediction_result", sa.Column("n_events", sa.Integer()))
    op.add_column("prediction_result", sa.Column("n_subjects", sa.Integer()))


def downgrade() -> None:
    op.drop_column("prediction_result", "n_subjects")
    op.drop_column("prediction_result", "n_events")
    op.drop_column("prediction_result", "n_training")
