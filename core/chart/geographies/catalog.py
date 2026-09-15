from __future__ import annotations

from .schemas import BoundarySource

MP_LBW_MODEL_AREAS = (
    "Madhya Pradesh",
    "Bhopal",
    "Chambal",
    "Gwalior",
    "Indore",
    "Jabalpur",
    "Narmadapuram",
    "Rewa",
    "Sagar",
    "Shahdol",
    "Ujjain",
)

INDIA_OGD = BoundarySource(
    key="india_ogd_admin_boundaries",
    name="Open Government Data Platform India — Admin Boundaries",
    authority="national",
    source_url="https://www.data.gov.in/catalog/admin-boundaries",
    license_name="Government Open Data License - India",
    attribution="Government of India Open Government Data Platform",
    native_levels=("admin1", "admin2", "admin3"),
    country_codes=frozenset({"IND"}),
)

UN_SALB = BoundarySource(
    key="un_salb",
    name="United Nations Second Administrative Level Boundaries",
    authority="un_authoritative",
    source_url="https://salb.un.org/en/data",
    license_name="UN SALB artifact-specific terms of use",
    attribution="United Nations SALB and the contributing national authority",
    native_levels=("admin1", "admin2"),
    license_requires_review=True,
)

GEOBOUNDARIES_OPEN = BoundarySource(
    key="geoboundaries_open",
    name="geoBoundaries gbOpen",
    authority="open_global",
    source_url="https://www.geoboundaries.org/api.html",
    license_name="Artifact-specific open licence",
    attribution="geoBoundaries, William & Mary geoLab",
    native_levels=("admin0", "admin1", "admin2", "admin3", "admin4", "admin5"),
    license_requires_review=True,
)

BOUNDARY_SOURCES: dict[str, BoundarySource] = {
    source.key: source for source in (INDIA_OGD, UN_SALB, GEOBOUNDARIES_OPEN)
}
