from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .routes import _remote, _snapshot

router = APIRouter(prefix="/hazards", tags=["solution-repository"])


class HazardItem(BaseModel):
    id: str
    label: str
    description: str | None = None
    hazardGroup: str | None = None
    imageUrl: str | None = None
    solutionCount: int


class HazardListResponse(BaseModel):
    items: list[HazardItem]


class HazardSolution(BaseModel):
    id: str
    name: str
    slug: str
    summary: str | None = None


class HazardDetail(HazardItem):
    solutions: list[HazardSolution]


@router.get("", response_model=HazardListResponse)
def list_hazards() -> dict:
    remote = _remote("api/public/hazards")
    return remote if remote is not None else {"items": _local_hazards()}


@router.get("/{hazard_id}", response_model=HazardDetail)
def get_hazard(hazard_id: str) -> dict:
    remote = _remote(f"api/public/hazards/{hazard_id}")
    if remote is not None:
        return remote
    hazards = {item["id"]: item for item in _local_hazards()}
    hazard = hazards.get(hazard_id)
    if hazard is None:
        raise HTTPException(status_code=404, detail="HAZARD_NOT_FOUND")
    solutions = [
        {
            "id": item["id"],
            "name": item["name"],
            "slug": item["slug"],
            "summary": item["summary"],
        }
        for item in _snapshot()["items"]
        if any(
            taxonomy["type"] == "hazard" and taxonomy["id"] == hazard_id
            for taxonomy in item["taxonomies"]
        )
    ]
    return {**hazard, "solutions": solutions}


def _local_hazards() -> list[dict]:
    counts: dict[str, dict] = {}
    for solution in _snapshot()["items"]:
        for taxonomy in solution["taxonomies"]:
            if taxonomy["type"] != "hazard":
                continue
            item = counts.setdefault(
                taxonomy["id"],
                {
                    "id": taxonomy["id"],
                    "label": taxonomy["label"],
                    "description": None,
                    "hazardGroup": None,
                    "imageUrl": None,
                    "solutionCount": 0,
                },
            )
            item["solutionCount"] += 1
    return sorted(counts.values(), key=lambda item: item["label"])
