from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select

from chart.model_registry.service import get_active_model_mappings
from chart.shared.db.models import AdminUnit, AppGeography
from chart.shared.db.session import get_session_factory

router = APIRouter(prefix="/geographies", tags=["geographies"])


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


@router.get("", response_model=list[GeographyResponse])
def list_geographies() -> list[GeographyResponse]:
    with get_session_factory()() as session:
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
        response = []
        for row, admin_unit in rows:
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
                        admin_unit is not None
                        and admin_unit.id in models
                    ),
                )
            )
        return response
