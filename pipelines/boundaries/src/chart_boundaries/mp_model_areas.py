from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections.abc import Mapping
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely.geometry import MultiPolygon, Polygon
from shapely.ops import unary_union

MODEL_DIVISIONS = (
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
REQUIRED_CROSSWALK_COLUMNS = (
    "current_district",
    "division",
    "source_geometry_name",
    "geometry_match",
)
ALLOWED_GEOMETRY_MATCHES = {"exact", "alias", "parent_pre_split"}


class BoundaryBuildError(ValueError):
    def __init__(self, code: str, detail: str) -> None:
        super().__init__(f"{code}: {detail}")
        self.code = code
        self.detail = detail


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load_source_manifest(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def load_crosswalk(path: Path) -> pd.DataFrame:
    crosswalk = pd.read_csv(path, dtype=str, keep_default_na=False)
    validate_crosswalk(crosswalk)
    return crosswalk


def validate_crosswalk(crosswalk: pd.DataFrame) -> None:
    missing_columns = sorted(set(REQUIRED_CROSSWALK_COLUMNS) - set(crosswalk.columns))
    if missing_columns:
        raise BoundaryBuildError(
            "MP_CROSSWALK_COLUMNS_MISSING", ", ".join(missing_columns)
        )
    if crosswalk.empty:
        raise BoundaryBuildError("MP_CROSSWALK_EMPTY", "no district mappings")

    for column in REQUIRED_CROSSWALK_COLUMNS:
        if crosswalk[column].str.strip().eq("").any():
            raise BoundaryBuildError(
                "MP_CROSSWALK_VALUE_MISSING", f"empty value in {column}"
            )
    if crosswalk["current_district"].duplicated().any():
        raise BoundaryBuildError(
            "MP_CROSSWALK_DISTRICT_DUPLICATE", "current districts must be unique"
        )

    divisions = set(crosswalk["division"])
    if divisions != set(MODEL_DIVISIONS):
        missing = sorted(set(MODEL_DIVISIONS) - divisions)
        extra = sorted(divisions - set(MODEL_DIVISIONS))
        raise BoundaryBuildError(
            "MP_CROSSWALK_DIVISIONS_MISMATCH",
            f"missing={missing}; extra={extra}",
        )

    matches = set(crosswalk["geometry_match"])
    if not matches <= ALLOWED_GEOMETRY_MATCHES:
        raise BoundaryBuildError(
            "MP_CROSSWALK_MATCH_UNKNOWN",
            ", ".join(sorted(matches - ALLOWED_GEOMETRY_MATCHES)),
        )

    for source_name, rows in crosswalk.groupby("source_geometry_name"):
        if rows["division"].nunique() != 1:
            raise BoundaryBuildError(
                "MP_CROSSWALK_SOURCE_AMBIGUOUS",
                f"{source_name} maps to more than one division",
            )
        if len(rows) > 1:
            statuses = set(rows["geometry_match"])
            if "parent_pre_split" not in statuses or statuses == {"parent_pre_split"}:
                raise BoundaryBuildError(
                    "MP_CROSSWALK_SOURCE_DUPLICATE",
                    f"{source_name} duplicates must identify a pre-split child",
                )


def verify_source_artifact(path: Path, source: Mapping[str, str]) -> None:
    expected = source.get("sha256", "")
    actual = file_sha256(path)
    if not re.fullmatch(r"[0-9a-f]{64}", expected):
        raise BoundaryBuildError(
            "BOUNDARY_SOURCE_HASH_INVALID", source.get("artifact_id", str(path))
        )
    if actual != expected:
        raise BoundaryBuildError(
            "BOUNDARY_SOURCE_HASH_MISMATCH",
            f"{source.get('artifact_id', path.name)} expected {expected}, got {actual}",
        )


def build_mp_model_areas(
    *,
    adm1_path: Path,
    adm2_path: Path,
    crosswalk_path: Path,
    source_manifest_path: Path,
) -> gpd.GeoDataFrame:
    manifest = load_source_manifest(source_manifest_path)
    verify_source_artifact(adm1_path, manifest["sources"]["adm1_validation"])
    verify_source_artifact(adm2_path, manifest["sources"]["adm2_boundaries"])
    verify_source_artifact(crosswalk_path, manifest["crosswalk"])
    crosswalk = load_crosswalk(crosswalk_path)

    adm1 = gpd.read_file(adm1_path)
    adm2 = gpd.read_file(adm2_path)
    _require_wgs84(adm1, "ADM1")
    _require_wgs84(adm2, "ADM2")
    _require_columns(adm1, {"shapeName", "shapeID", "geometry"}, "ADM1")
    _require_columns(adm2, {"shapeName", "shapeID", "geometry"}, "ADM2")

    mp_states = adm1.loc[adm1["shapeName"] == "Madhya Pradesh"]
    if len(mp_states) != 1:
        raise BoundaryBuildError(
            "MP_STATE_BOUNDARY_COUNT",
            f"expected 1 Madhya Pradesh, got {len(mp_states)}",
        )
    mp_geometry = mp_states.geometry.iloc[0]
    inside_mp = adm2.loc[
        adm2.geometry.representative_point().within(mp_geometry)
    ].copy()

    expected_source_names = set(crosswalk["source_geometry_name"])
    actual_source_names = set(inside_mp["shapeName"])
    if actual_source_names != expected_source_names:
        raise BoundaryBuildError(
            "MP_DISTRICT_BOUNDARY_SET_MISMATCH",
            "missing="
            f"{sorted(expected_source_names - actual_source_names)}; unexpected="
            f"{sorted(actual_source_names - expected_source_names)}",
        )

    source_to_division = (
        crosswalk[["source_geometry_name", "division"]]
        .drop_duplicates()
        .set_index("source_geometry_name")["division"]
        .to_dict()
    )
    inside_mp["division"] = inside_mp["shapeName"].map(source_to_division)

    artifact = manifest["sources"]["adm2_boundaries"]
    transform = manifest["transform"]
    rows: list[dict] = []
    state_geometry = _as_multipolygon(unary_union(inside_mp.geometry.tolist()))
    rows.append(
        _model_area_row(
            area_name="Madhya Pradesh",
            geography_level="state",
            current_district_count=len(crosswalk),
            source_geometry_count=len(inside_mp),
            geometry=state_geometry,
            artifact=artifact,
            transform=transform,
            manifest=manifest,
        )
    )

    for division in MODEL_DIVISIONS:
        division_geometries = inside_mp.loc[
            inside_mp["division"] == division, "geometry"
        ].tolist()
        rows.append(
            _model_area_row(
                area_name=division,
                geography_level="division",
                current_district_count=int((crosswalk["division"] == division).sum()),
                source_geometry_count=len(division_geometries),
                geometry=_as_multipolygon(unary_union(division_geometries)),
                artifact=artifact,
                transform=transform,
                manifest=manifest,
            )
        )

    output = gpd.GeoDataFrame(rows, geometry="geometry", crs="EPSG:4326")
    if output.geometry.is_empty.any() or not output.geometry.is_valid.all():
        raise BoundaryBuildError(
            "MP_MODEL_AREA_GEOMETRY_INVALID", "empty or invalid output geometry"
        )
    if set(output.geom_type) != {"MultiPolygon"}:
        raise BoundaryBuildError(
            "MP_MODEL_AREA_GEOMETRY_TYPE",
            f"expected MultiPolygon, got {sorted(set(output.geom_type))}",
        )
    return output


def write_build_outputs(
    model_areas: gpd.GeoDataFrame,
    *,
    output_path: Path,
    build_manifest_path: Path,
    source_manifest_path: Path,
    crosswalk_path: Path,
) -> dict:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    geojson = json.loads(model_areas.to_json(drop_id=True, to_wgs84=True))
    output_path.write_text(
        json.dumps(geojson, sort_keys=True, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    build_record = {
        "schema_version": 1,
        "area_count": len(model_areas),
        "areas": model_areas["area_name"].tolist(),
        "output_path": output_path.name,
        "output_sha256": file_sha256(output_path),
        "source_manifest_sha256": file_sha256(source_manifest_path),
        "crosswalk_sha256": file_sha256(crosswalk_path),
    }
    build_manifest_path.write_text(
        json.dumps(build_record, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return build_record


def _model_area_row(
    *,
    area_name: str,
    geography_level: str,
    current_district_count: int,
    source_geometry_count: int,
    geometry: MultiPolygon,
    artifact: Mapping[str, str],
    transform: Mapping[str, str],
    manifest: Mapping,
) -> dict:
    return {
        "area_name": area_name,
        "admin_unit_code": _slug(area_name),
        "geography_level": geography_level,
        "country_code": "IND",
        "current_district_count": current_district_count,
        "source_geometry_count": source_geometry_count,
        "boundary_source_key": manifest["selection"]["source_key"],
        "boundary_source_version": artifact["version"],
        "boundary_artifact_sha256": artifact["sha256"],
        "boundary_license": artifact["license"],
        "crosswalk_source_url": manifest["crosswalk"]["source_url"],
        "crosswalk_snapshot_date": manifest["crosswalk"]["snapshot_date"],
        "transform_id": transform["id"],
        "geometry": geometry,
    }


def _require_wgs84(frame: gpd.GeoDataFrame, label: str) -> None:
    if frame.crs is None or frame.crs.to_epsg() != 4326:
        raise BoundaryBuildError(
            "BOUNDARY_SOURCE_CRS_INVALID", f"{label} must be EPSG:4326"
        )


def _require_columns(frame: gpd.GeoDataFrame, required: set[str], label: str) -> None:
    missing = sorted(required - set(frame.columns))
    if missing:
        raise BoundaryBuildError(
            "BOUNDARY_SOURCE_COLUMNS_MISSING", f"{label}: {', '.join(missing)}"
        )


def _as_multipolygon(geometry) -> MultiPolygon:
    if isinstance(geometry, MultiPolygon):
        return geometry
    if isinstance(geometry, Polygon):
        return MultiPolygon([geometry])
    raise BoundaryBuildError(
        "MP_MODEL_AREA_GEOMETRY_TYPE", f"cannot convert {geometry.geom_type}"
    )


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build the 11 Madhya Pradesh LBW model-area boundaries."
    )
    parser.add_argument("--adm1", type=Path, required=True)
    parser.add_argument("--adm2", type=Path, required=True)
    parser.add_argument("--crosswalk", type=Path, required=True)
    parser.add_argument("--source-manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--build-manifest", type=Path, required=True)
    args = parser.parse_args()

    model_areas = build_mp_model_areas(
        adm1_path=args.adm1,
        adm2_path=args.adm2,
        crosswalk_path=args.crosswalk,
        source_manifest_path=args.source_manifest,
    )
    record = write_build_outputs(
        model_areas,
        output_path=args.output,
        build_manifest_path=args.build_manifest,
        source_manifest_path=args.source_manifest,
        crosswalk_path=args.crosswalk,
    )
    print(json.dumps(record, sort_keys=True))


if __name__ == "__main__":
    main()
