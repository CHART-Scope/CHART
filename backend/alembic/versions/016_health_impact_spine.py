"""add erf_parameters, health_impact, and covariate tables

Revision ID: 016_health_impact_spine
Revises: 015_reconcile_legacy_application_schema
Create Date: 2026-07-31

Adds the persistence spine for the Short-term / Long-term prediction
dashboard: the fitted heat-health curve published by the modeler, the
precomputed attributable-fraction / attributable-number results shown on
the dashboard, and the socioeconomic covariates (population, pollution)
used to convert fraction into count.

The tables have no consumers yet; downstream migrations add API and
Dagster wiring in later slices.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "016_health_impact_spine"
down_revision: str | None = "015_reconcile_legacy_application_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("erf_parameters"):
        op.create_table(
            "erf_parameters",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("geography_id", sa.Integer(), nullable=False),
            sa.Column("outcome", sa.String(length=64), nullable=False),
            sa.Column(
                "spline_coefficients",
                sa.dialects.postgresql.JSONB().with_variant(sa.JSON(), "sqlite"),
                nullable=False,
            ),
            sa.Column(
                "lag_window",
                sa.dialects.postgresql.JSONB().with_variant(sa.JSON(), "sqlite"),
                nullable=False,
            ),
            sa.Column("reference_percentile_milli", sa.Integer(), nullable=False),
            sa.Column("projection_source", sa.String(length=128)),
            sa.Column("git_ref", sa.String(length=128), nullable=False),
            sa.Column(
                "published_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column("notes", sa.Text()),
            sa.ForeignKeyConstraint(
                ["geography_id"],
                ["chart_geographies.id"],
                name="erf_parameters_geography_id_chart_geographies_id_fk",
                ondelete="RESTRICT",
            ),
            sa.CheckConstraint(
                "reference_percentile_milli BETWEEN 0 AND 100000",
                name="erf_parameters_reference_percentile_range",
            ),
            sa.UniqueConstraint(
                "geography_id",
                "outcome",
                "git_ref",
                name="uq_erf_parameters_geography_outcome_git_ref",
            ),
        )
        op.create_index(
            "ix_erf_parameters_geography_outcome",
            "erf_parameters",
            ["geography_id", "outcome"],
        )

    if not inspector.has_table("covariate"):
        op.create_table(
            "covariate",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("admin_unit_id", sa.Integer(), nullable=False),
            sa.Column("provenance_id", sa.Integer(), nullable=False),
            sa.Column("kind", sa.String(length=32), nullable=False),
            sa.Column(
                "scenario_socio",
                sa.String(length=32),
                nullable=False,
                server_default="ssp2",
            ),
            sa.Column("valid_year", sa.Integer(), nullable=False),
            sa.Column("value", sa.Float(), nullable=False),
            sa.Column("unit", sa.String(length=32)),
            sa.Column(
                "data_label",
                sa.Enum(
                    "modeled",
                    "observed",
                    "reanalysis",
                    "forecast",
                    "projection",
                    "sample",
                    name="data_label",
                    create_type=False,
                ),
                nullable=False,
            ),
            sa.ForeignKeyConstraint(
                ["admin_unit_id"],
                ["admin_unit.id"],
                name="covariate_admin_unit_id_admin_unit_id_fk",
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(
                ["provenance_id"],
                ["provenance.id"],
                name="covariate_provenance_id_provenance_id_fk",
                ondelete="RESTRICT",
            ),
            sa.UniqueConstraint(
                "admin_unit_id",
                "kind",
                "scenario_socio",
                "valid_year",
                name="uq_covariate_grain",
            ),
        )
        op.create_index(
            "ix_covariate_admin_kind_year",
            "covariate",
            ["admin_unit_id", "kind", "valid_year"],
        )

    if not inspector.has_table("health_impact"):
        op.create_table(
            "health_impact",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("admin_unit_id", sa.Integer(), nullable=False),
            sa.Column("erf_parameters_id", sa.Integer(), nullable=False),
            sa.Column("climate_run_id", sa.Integer(), nullable=False),
            sa.Column("scenario", sa.String(length=32), nullable=False),
            sa.Column("horizon", sa.String(length=16), nullable=False),
            sa.Column("valid_month", sa.Date(), nullable=False),
            sa.Column("relative_risk_milli", sa.Integer(), nullable=False),
            sa.Column("rr_ci_low_milli", sa.Integer(), nullable=False),
            sa.Column("rr_ci_high_milli", sa.Integer(), nullable=False),
            sa.Column("attributable_fraction_milli", sa.Integer(), nullable=False),
            sa.Column("attributable_number", sa.Integer()),
            sa.Column("ensemble_spread_milli", sa.Integer()),
            sa.Column(
                "data_label",
                sa.Enum(
                    "modeled",
                    "observed",
                    "reanalysis",
                    "forecast",
                    "projection",
                    "sample",
                    name="data_label",
                    create_type=False,
                ),
                nullable=False,
            ),
            sa.Column(
                "computed_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.ForeignKeyConstraint(
                ["admin_unit_id"],
                ["admin_unit.id"],
                name="health_impact_admin_unit_id_admin_unit_id_fk",
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(
                ["erf_parameters_id"],
                ["erf_parameters.id"],
                name="health_impact_erf_parameters_id_erf_parameters_id_fk",
                ondelete="RESTRICT",
            ),
            sa.ForeignKeyConstraint(
                ["climate_run_id"],
                ["climate_run.id"],
                name="health_impact_climate_run_id_climate_run_id_fk",
                ondelete="RESTRICT",
            ),
            sa.CheckConstraint(
                "rr_ci_low_milli <= relative_risk_milli",
                name="health_impact_ci_low_le_rr",
            ),
            sa.CheckConstraint(
                "relative_risk_milli <= rr_ci_high_milli",
                name="health_impact_rr_le_ci_high",
            ),
            sa.CheckConstraint(
                "attributable_number IS NULL OR attributable_number >= 0",
                name="health_impact_attributable_number_nonneg",
            ),
            sa.UniqueConstraint(
                "admin_unit_id",
                "scenario",
                "horizon",
                "valid_month",
                name="uq_health_impact_grain",
            ),
        )
        op.create_index(
            "ix_health_impact_dashboard_read",
            "health_impact",
            ["admin_unit_id", "scenario", "valid_month"],
        )
        op.create_index(
            "ix_health_impact_climate_run",
            "health_impact",
            ["climate_run_id"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("health_impact"):
        op.drop_index("ix_health_impact_climate_run", table_name="health_impact")
        op.drop_index("ix_health_impact_dashboard_read", table_name="health_impact")
        op.drop_table("health_impact")

    if inspector.has_table("covariate"):
        op.drop_index("ix_covariate_admin_kind_year", table_name="covariate")
        op.drop_table("covariate")

    if inspector.has_table("erf_parameters"):
        op.drop_index(
            "ix_erf_parameters_geography_outcome", table_name="erf_parameters"
        )
        op.drop_table("erf_parameters")
