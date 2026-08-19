from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field
from sqlalchemy import select

from chart.model_registry.service import get_active_model_mappings
from chart.setup.model_configs import deployed_geography_ids_by_country
from chart.shared.db.models import (
    ActiveModelAssignment,
    AdminUnit,
    AppGeography,
    ModelAreaMapping,
    ModelRelease,
)
from chart.shared.db.session import get_session_factory

router = APIRouter(prefix="/geographies", tags=["geographies"])


class GeographyModelResponse(BaseModel):
    outcome: str
    modelAreaName: str
    releaseId: str


class GeographyResponse(BaseModel):
    id: str
    countryCode: str
    level: str
    levelLabel: str
    name: str
    parentId: str | None
    externalCode: str | None
    path: str
    sortOrder: int
    supportsPrediction: bool
    modelAreaName: str | None = None
    models: list[GeographyModelResponse] = Field(default_factory=list)


@router.get("", response_model=list[GeographyResponse])
def list_geographies() -> list[GeographyResponse]:
    with get_session_factory()() as session:
        configured_ids = deployed_geography_ids_by_country()
        rows = session.execute(
            select(AppGeography, AdminUnit)
            .outerjoin(AdminUnit, AdminUnit.app_geography_id == AppGeography.id)
            .order_by(
                AppGeography.country_code,
                AppGeography.sort_order,
                AppGeography.name,
            )
        ).all()
        models = get_active_model_mappings(
            session,
            [admin_unit.id for _, admin_unit in rows if admin_unit is not None],
        )
        all_model_rows = session.execute(
            select(
                ActiveModelAssignment.admin_unit_id,
                ModelRelease.outcome,
                ModelAreaMapping.model_area_key,
                ModelRelease.id,
            )
            .join(
                ModelRelease,
                ModelRelease.id == ActiveModelAssignment.model_release_id,
            )
            .join(
                ModelAreaMapping,
                (ModelAreaMapping.model_release_id == ModelRelease.id)
                & (
                    ModelAreaMapping.admin_unit_id
                    == ActiveModelAssignment.admin_unit_id
                ),
            )
        ).all()
        models_by_admin: dict[int, list[GeographyModelResponse]] = {}
        for admin_id, outcome, model_area, release_id in all_model_rows:
            models_by_admin.setdefault(admin_id, []).append(
                GeographyModelResponse(
                    outcome=outcome,
                    modelAreaName=model_area,
                    releaseId=release_id,
                )
            )
        response = []
        for row, admin_unit in rows:
            country_ids = configured_ids.get(row.country_code)
            if country_ids is not None and row.id not in country_ids:
                continue
            response.append(
                GeographyResponse(
                    id=row.id,
                    countryCode=row.country_code,
                    level=row.level,
                    levelLabel=row.level_label,
                    name=row.name,
                    parentId=row.parent_id,
                    externalCode=row.external_code,
                    path=row.path,
                    sortOrder=row.sort_order,
                    supportsPrediction=(
                        admin_unit is not None and admin_unit.id in models
                    ),
                    modelAreaName=(
                        models[admin_unit.id].model_area_name
                        if admin_unit is not None and admin_unit.id in models
                        else None
                    ),
                    models=(
                        models_by_admin.get(admin_unit.id, [])
                        if admin_unit is not None
                        else []
                    ),
                )
            )
        return response
