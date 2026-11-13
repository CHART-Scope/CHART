"""Lookups the checks need: a country's place, and who owns a resource."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from chart.shared.db.models import AppGeography, Department, DepartmentOwnership


def country_path(session: Session, country_code: str) -> str | None:
    return session.scalar(
        select(AppGeography.path).where(
            AppGeography.level == "country",
            AppGeography.country_code == country_code.upper(),
        )
    )


def owning_departments(
    session: Session, kind: str, key: str, country_code: str
) -> set[int]:
    """The country's departments owning a data source or VRA indicator group
    (none: open to anyone with write). Ownership is per workspace: Kenya's
    Health owning ERA5 says nothing about India's pulls."""

    return set(
        session.scalars(
            select(DepartmentOwnership.department_id)
            .join(Department, Department.id == DepartmentOwnership.department_id)
            .where(
                DepartmentOwnership.resource_kind == kind,
                DepartmentOwnership.resource_key == key,
                Department.country_code == country_code.upper(),
            )
        )
    )
