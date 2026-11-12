"""Lookups the checks need: a country's place, and who owns a resource."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from chart.shared.db.models import AppGeography, DepartmentOwnership


def country_path(session: Session, country_code: str) -> str | None:
    return session.scalar(
        select(AppGeography.path).where(
            AppGeography.level == "country",
            AppGeography.country_code == country_code.upper(),
        )
    )


def owning_departments(session: Session, kind: str, key: str) -> set[int]:
    """Departments owning a data source or VRA indicator group (none: open
    to anyone with write)."""

    return set(
        session.scalars(
            select(DepartmentOwnership.department_id).where(
                DepartmentOwnership.resource_kind == kind,
                DepartmentOwnership.resource_key == key,
            )
        )
    )
