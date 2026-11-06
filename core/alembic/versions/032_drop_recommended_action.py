"""drop recommended_action

Revision ID: 032_drop_recommended_action
Revises: 031_recommendation_setting
Create Date: 2026-11-06

Actions are read from the public action feed (``chart.actions``), so the
table setup filled from the old bundled seed is no longer read or written.
Its rows were only a copy of that seed; nothing else referenced them.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic import op

revision = "032_drop_recommended_action"
down_revision = "031_recommendation_setting"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_table("recommended_action")


def downgrade() -> None:
    # Recreate the empty table exactly as 017 created it; the seed rows are
    # not restored.
    path = Path(__file__).with_name("017_recommended_actions.py")
    spec = importlib.util.spec_from_file_location("recommended_actions_017", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.upgrade()
