"""Remove legacy fixed geography level lists.

Revision ID: 029_configurable_geo_levels
Revises: 028_vra
Create Date: 2026-10-28

Legacy application databases retain checks limiting level keys to country and
geo_level_1/2/3. Alembic-created databases already use the country configuration
foreign key as the level contract. Remove only those obsolete checks so both
schemas accept configured district, constituency and future geography levels.
"""

from alembic import op

revision = "029_configurable_geo_levels"
down_revision = "028_vra"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE country_geo_config "
        "DROP CONSTRAINT IF EXISTS country_geo_config_level_key_check"
    )
    op.execute(
        "ALTER TABLE geographies DROP CONSTRAINT IF EXISTS geographies_level_check"
    )


def downgrade() -> None:
    # Reinstating the whitelist would reject already registered fine areas.
    # As with legacy schema reconciliation (015), preserve existing data.
    pass
