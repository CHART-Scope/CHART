"""add durable leases, immutable provenance, and scoped model activation

Revision ID: 013_systemic_safety
Revises: 012_status_server_defaults
Create Date: 2026-07-27
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "013_systemic_safety"
down_revision: str | None = "012_status_server_defaults"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "setup_state",
        sa.Column(
            "phase",
            sa.String(length=32),
            nullable=False,
            server_default="uninitialized",
        ),
    )
    op.add_column("setup_state", sa.Column("provisioning_token", sa.String(length=64)))
    op.add_column(
        "setup_state",
        sa.Column("provisioning_request_hash", sa.String(length=64)),
    )
    op.add_column(
        "setup_state",
        sa.Column("provisioning_started_at", sa.DateTime(timezone=True)),
    )
    op.add_column("setup_state", sa.Column("last_error_code", sa.String(length=128)))
    op.execute(
        "UPDATE setup_state SET phase = CASE WHEN completed THEN 'complete' "
        "ELSE 'uninitialized' END"
    )
    op.execute(
        "INSERT INTO setup_state (id, completed, phase, selected_hazards) "
        "VALUES ('default', false, 'uninitialized', '[]'::json) "
        "ON CONFLICT (id) DO NOTHING"
    )

    op.add_column("climate_run", sa.Column("source_name", sa.String(length=128)))
    op.add_column("climate_run", sa.Column("source_version", sa.String(length=128)))
    op.add_column("climate_run", sa.Column("source_uri", sa.Text()))
    op.add_column("climate_run", sa.Column("source_license", sa.String(length=256)))
    op.execute(
        """
        UPDATE climate_run AS run
        SET source_name = source.name,
            source_version = source.version,
            source_uri = COALESCE(run.raw_object_uri, provenance.source_uri, source.source_uri),
            source_license = COALESCE(source.license, provenance.license, 'unknown')
        FROM data_source AS source, provenance
        WHERE run.data_source_id = source.id
          AND run.provenance_id = provenance.id
        """
    )

    # Collapse any legacy duplicate catalog rows before enforcing one logical
    # source per geography. Historical source metadata now lives on climate_run.
    op.execute(
        """
        WITH canonical AS (
          SELECT id,
                 min(id) OVER (PARTITION BY name, geography_id) AS keep_id
          FROM data_source
        )
        UPDATE climate_run AS run
        SET data_source_id = canonical.keep_id
        FROM canonical
        WHERE run.data_source_id = canonical.id
          AND canonical.id <> canonical.keep_id
        """
    )
    op.execute(
        """
        DELETE FROM data_source AS source
        USING (
          SELECT id,
                 min(id) OVER (PARTITION BY name, geography_id) AS keep_id
          FROM data_source
        ) AS duplicate
        WHERE source.id = duplicate.id
          AND duplicate.id <> duplicate.keep_id
        """
    )
    op.create_unique_constraint(
        "uq_data_source_name_geography",
        "data_source",
        ["name", "geography_id"],
    )
    op.create_index(
        "ix_district_climate_selection",
        "district_climate",
        ["admin_unit_id", "period_month", "variable", "climate_run_id"],
    )

    op.create_table(
        "active_model_assignment",
        sa.Column("admin_unit_id", sa.Integer(), nullable=False),
        sa.Column("module", sa.String(length=64), nullable=False),
        sa.Column("outcome", sa.String(length=64), nullable=False),
        sa.Column("model_release_id", sa.String(length=128), nullable=False),
        sa.Column(
            "activated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["admin_unit_id"], ["admin_unit.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["model_release_id"], ["model_release.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("admin_unit_id", "module", "outcome"),
    )
    op.create_index(
        "ix_active_model_assignment_release",
        "active_model_assignment",
        ["model_release_id"],
    )
    op.execute(
        """
        INSERT INTO active_model_assignment (
          admin_unit_id, module, outcome, model_release_id, activated_at
        )
        SELECT DISTINCT ON (mapping.admin_unit_id, release.module, release.outcome)
          mapping.admin_unit_id,
          release.module,
          release.outcome,
          release.id,
          COALESCE(release.activated_at, release.created_at)
        FROM model_area_mapping AS mapping
        JOIN model_release AS release ON release.id = mapping.model_release_id
        WHERE release.status = 'active'
        ORDER BY mapping.admin_unit_id, release.module, release.outcome,
                 release.activated_at DESC NULLS LAST, release.created_at DESC
        """
    )

    op.add_column(
        "prediction_request",
        sa.Column("model_artifact_sha256", sa.String(length=64)),
    )
    op.add_column(
        "prediction_request",
        sa.Column("source_as_of_at", sa.DateTime(timezone=True)),
    )
    op.add_column("prediction_request", sa.Column("lease_token", sa.String(length=64)))
    op.add_column("prediction_request", sa.Column("lease_owner", sa.String(length=128)))
    op.add_column(
        "prediction_request",
        sa.Column("lease_expires_at", sa.DateTime(timezone=True)),
    )
    op.add_column(
        "prediction_request", sa.Column("heartbeat_at", sa.DateTime(timezone=True))
    )
    op.add_column(
        "prediction_request",
        sa.Column("next_attempt_at", sa.DateTime(timezone=True)),
    )
    op.execute(
        "UPDATE prediction_request "
        "SET source_as_of_at = COALESCE(source_as_of_at, created_at)"
    )
    op.create_check_constraint(
        "ck_prediction_request_status",
        "prediction_request",
        "status IN ('waiting', 'queued', 'running', 'completed', 'failed')",
    )
    op.create_check_constraint(
        "ck_prediction_request_stage",
        "prediction_request",
        "stage IN ('waiting_for_data', 'queued', 'preparing_climate', "
        "'climate_ready', 'predicting', 'completed', 'failed')",
    )
    op.create_index(
        "ix_prediction_request_lease",
        "prediction_request",
        ["status", "lease_expires_at", "next_attempt_at"],
    )

    op.create_table(
        "ingestion_lease",
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column(
            "status",
            sa.String(length=16),
            nullable=False,
            server_default="running",
        ),
        sa.Column("owner_token", sa.String(length=64), nullable=False),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("result_climate_run_id", sa.Integer()),
        sa.Column("error_code", sa.String(length=128)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "status IN ('running', 'completed', 'failed')",
            name="ck_ingestion_lease_status",
        ),
        sa.ForeignKeyConstraint(
            ["result_climate_run_id"], ["climate_run.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("key"),
    )
    op.create_index(
        "ix_ingestion_lease_status_expiry",
        "ingestion_lease",
        ["status", "lease_expires_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_ingestion_lease_status_expiry", table_name="ingestion_lease")
    op.drop_table("ingestion_lease")

    op.drop_index("ix_prediction_request_lease", table_name="prediction_request")
    op.drop_constraint(
        "ck_prediction_request_stage",
        "prediction_request",
        type_="check",
    )
    op.drop_constraint(
        "ck_prediction_request_status",
        "prediction_request",
        type_="check",
    )
    for column in (
        "next_attempt_at",
        "heartbeat_at",
        "lease_expires_at",
        "lease_owner",
        "lease_token",
        "source_as_of_at",
        "model_artifact_sha256",
    ):
        op.drop_column("prediction_request", column)

    op.drop_index(
        "ix_active_model_assignment_release",
        table_name="active_model_assignment",
    )
    op.drop_table("active_model_assignment")

    op.drop_constraint("uq_data_source_name_geography", "data_source", type_="unique")
    op.drop_index("ix_district_climate_selection", table_name="district_climate")
    for column in (
        "source_license",
        "source_uri",
        "source_version",
        "source_name",
    ):
        op.drop_column("climate_run", column)

    for column in (
        "last_error_code",
        "provisioning_started_at",
        "provisioning_request_hash",
        "provisioning_token",
        "phase",
    ):
        op.drop_column("setup_state", column)
