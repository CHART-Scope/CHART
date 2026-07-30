from __future__ import annotations

import json
from pathlib import Path

import geopandas as gpd
import pandas as pd
import pytest
from shapely.geometry import box

from chart_boundaries.mp_model_areas import (
    MODEL_DIVISIONS,
    BoundaryBuildError,
    build_mp_model_areas,
    file_sha256,
    load_crosswalk,
    write_build_outputs,
)


def _fixture_files(tmp_path: Path, *, unexpected_district: bool = False) -> dict:
    adm1_path = tmp_path / "adm1.geojson"
    adm2_path = tmp_path / "adm2.geojson"
    crosswalk_path = tmp_path / "crosswalk.csv"
    source_manifest_path = tmp_path / "source-manifest.json"

    adm1 = gpd.GeoDataFrame(
        [
            {
                "shapeName": "Madhya Pradesh",
                "shapeID": "state-1",
                "geometry": box(-0.5, -0.5, 10.5, 1.5),
            }
        ],
        crs="EPSG:4326",
    )
    adm1.to_file(adm1_path, driver="GeoJSON")

    district_rows = [
        {
            "shapeName": f"Source {index}",
            "shapeID": f"district-{index}",
            "geometry": box(index, 0, index + 0.9, 1),
        }
        for index in range(len(MODEL_DIVISIONS))
    ]
    if unexpected_district:
        district_rows.append(
            {
                "shapeName": "Unexpected",
                "shapeID": "district-extra",
                "geometry": box(9.91, 0, 9.99, 0.1),
            }
        )
    gpd.GeoDataFrame(district_rows, crs="EPSG:4326").to_file(
        adm2_path, driver="GeoJSON"
    )

    crosswalk_rows = [
        {
            "current_district": f"District {index}",
            "division": division,
            "source_geometry_name": f"Source {index}",
            "geometry_match": "exact",
        }
        for index, division in enumerate(MODEL_DIVISIONS)
    ]
    crosswalk_rows.append(
        {
            "current_district": "New child district",
            "division": MODEL_DIVISIONS[0],
            "source_geometry_name": "Source 0",
            "geometry_match": "parent_pre_split",
        }
    )
    pd.DataFrame(crosswalk_rows).to_csv(crosswalk_path, index=False)

    source_manifest = {
        "selection": {"source_key": "geoboundaries_open"},
        "sources": {
            "adm1_validation": {
                "artifact_id": "adm1",
                "version": "test-adm1",
                "license": "test",
                "sha256": file_sha256(adm1_path),
            },
            "adm2_boundaries": {
                "artifact_id": "adm2",
                "version": "test-adm2",
                "license": "test",
                "sha256": file_sha256(adm2_path),
            },
        },
        "crosswalk": {
            "source_url": "https://example.test/crosswalk",
            "snapshot_date": "2026-07-21",
            "sha256": file_sha256(crosswalk_path),
        },
        "transform": {"id": "test-dissolve-v1"},
    }
    source_manifest_path.write_text(json.dumps(source_manifest), encoding="utf-8")
    return {
        "adm1_path": adm1_path,
        "adm2_path": adm2_path,
        "crosswalk_path": crosswalk_path,
        "source_manifest_path": source_manifest_path,
    }


def test_builds_state_and_all_ten_model_divisions_with_provenance(
    tmp_path: Path,
) -> None:
    files = _fixture_files(tmp_path)
    model_areas = build_mp_model_areas(**files)

    assert model_areas["area_name"].tolist() == ["Madhya Pradesh", *MODEL_DIVISIONS]
    assert set(model_areas.geom_type) == {"MultiPolygon"}
    assert model_areas.geometry.is_valid.all()
    assert model_areas.loc[0, "current_district_count"] == 11
    assert model_areas.loc[0, "source_geometry_count"] == 10
    assert set(model_areas["boundary_source_key"]) == {"geoboundaries_open"}
    assert set(model_areas["transform_id"]) == {"test-dissolve-v1"}

    output_path = tmp_path / "model-areas.geojson"
    build_manifest_path = tmp_path / "model-areas.build.json"
    record = write_build_outputs(
        model_areas,
        output_path=output_path,
        build_manifest_path=build_manifest_path,
        source_manifest_path=files["source_manifest_path"],
        crosswalk_path=files["crosswalk_path"],
    )
    assert record["area_count"] == 11
    assert record["output_sha256"] == file_sha256(output_path)
    assert json.loads(build_manifest_path.read_text())["areas"] == [
        "Madhya Pradesh",
        *MODEL_DIVISIONS,
    ]


def test_rejects_a_changed_source_artifact(tmp_path: Path) -> None:
    files = _fixture_files(tmp_path)
    manifest = json.loads(files["source_manifest_path"].read_text())
    manifest["sources"]["adm2_boundaries"]["sha256"] = "0" * 64
    files["source_manifest_path"].write_text(json.dumps(manifest), encoding="utf-8")

    with pytest.raises(BoundaryBuildError) as error:
        build_mp_model_areas(**files)

    assert error.value.code == "BOUNDARY_SOURCE_HASH_MISMATCH"


def test_rejects_a_changed_crosswalk_snapshot(tmp_path: Path) -> None:
    files = _fixture_files(tmp_path)
    files["crosswalk_path"].write_text(
        files["crosswalk_path"].read_text(encoding="utf-8") + "\n",
        encoding="utf-8",
    )

    with pytest.raises(BoundaryBuildError) as error:
        build_mp_model_areas(**files)

    assert error.value.code == "BOUNDARY_SOURCE_HASH_MISMATCH"


def test_rejects_an_unmapped_district_inside_mp(tmp_path: Path) -> None:
    files = _fixture_files(tmp_path, unexpected_district=True)

    with pytest.raises(BoundaryBuildError) as error:
        build_mp_model_areas(**files)

    assert error.value.code == "MP_DISTRICT_BOUNDARY_SET_MISMATCH"
    assert "Unexpected" in error.value.detail


def test_rejects_one_source_geometry_mapped_to_two_divisions(tmp_path: Path) -> None:
    files = _fixture_files(tmp_path)
    crosswalk = pd.read_csv(files["crosswalk_path"])
    crosswalk.loc[crosswalk["current_district"] == "New child district", "division"] = (
        MODEL_DIVISIONS[1]
    )
    crosswalk.to_csv(files["crosswalk_path"], index=False)
    manifest = json.loads(files["source_manifest_path"].read_text(encoding="utf-8"))
    manifest["crosswalk"]["sha256"] = file_sha256(files["crosswalk_path"])
    files["source_manifest_path"].write_text(json.dumps(manifest), encoding="utf-8")

    with pytest.raises(BoundaryBuildError) as error:
        build_mp_model_areas(**files)

    assert error.value.code == "MP_CROSSWALK_SOURCE_AMBIGUOUS"


def test_committed_crosswalk_covers_55_current_district_rows_and_52_geometries() -> (
    None
):
    crosswalk_path = (
        Path(__file__).parents[1] / "data" / "mp_district_division_crosswalk.csv"
    )
    crosswalk = load_crosswalk(crosswalk_path)

    assert len(crosswalk) == 55
    assert crosswalk["source_geometry_name"].nunique() == 52
    assert set(crosswalk["division"]) == set(MODEL_DIVISIONS)
    assert set(
        crosswalk.loc[
            crosswalk["geometry_match"] == "parent_pre_split", "current_district"
        ]
    ) == {"Maihar", "Mauganj", "Pandhurna"}
