"""Persist a fitted exposure-response curve into `erf_parameters`.

Idempotent on ``(geography, outcome, git_ref)``: republishing the exact
same fit returns the existing row unchanged; a different fit for the
same geography+outcome creates a new row so the previous version stays
addressable for audit.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from chart.shared.db.models import ErfParameters, Geography

from .schemas import ErfParametersSpec


class GeographyNotFound(LookupError):
    """The geography slug does not exist in `chart_geographies`."""


@dataclass(frozen=True)
class PublicationOutcome:
    row: ErfParameters
    created: bool


def publish_erf_parameters(
    session: Session, spec: ErfParametersSpec
) -> PublicationOutcome:
    """Insert or return the erf_parameters row for a fitted curve.

    The session is *not* committed by this function: callers wrap it in a
    transaction so a failed publish leaves nothing behind.
    """

    geography = session.scalar(
        select(Geography).where(Geography.slug == spec.geography_slug)
    )
    if geography is None:
        raise GeographyNotFound(spec.geography_slug)

    existing = session.scalar(
        select(ErfParameters).where(
            ErfParameters.geography_id == geography.id,
            ErfParameters.outcome == spec.outcome,
            ErfParameters.git_ref == spec.git_ref,
        )
    )
    if existing is not None:
        return PublicationOutcome(row=existing, created=False)

    row = ErfParameters(
        geography_id=geography.id,
        outcome=spec.outcome,
        spline_coefficients=spec.spline_coefficients,
        lag_window=spec.lag_window.model_dump(),
        reference_percentile_milli=spec.reference_percentile_milli,
        projection_source=spec.projection_source,
        git_ref=spec.git_ref,
        notes=spec.notes,
    )
    session.add(row)
    session.flush()
    return PublicationOutcome(row=row, created=True)
