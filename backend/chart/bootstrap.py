from __future__ import annotations

import argparse
import json
import shutil
import ssl
import tempfile
import urllib.request
from pathlib import Path

import certifi

from chart_boundaries.mp_model_areas import build_mp_model_areas, write_build_outputs

from chart.geographies.load import load_mp_model_area_geojson
from chart.model_registry.schemas import ModelReleaseSpec
from chart.model_registry.service import register_model_release
from chart.shared.db.session import get_session_factory


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Load the versioned MP boundaries and model-to-place mapping."
    )
    parser.add_argument("--source-manifest", type=Path, required=True)
    parser.add_argument("--crosswalk", type=Path, required=True)
    parser.add_argument("--model-release", type=Path, required=True)
    parser.add_argument("--activate-model", action="store_true")
    args = parser.parse_args()

    manifest = json.loads(args.source_manifest.read_text(encoding="utf-8"))
    with tempfile.TemporaryDirectory(prefix="chart-mp-boundaries-") as temp:
        temp_dir = Path(temp)
        adm1 = temp_dir / "adm1.geojson"
        adm2 = temp_dir / "adm2.geojson"
        _download(manifest["sources"]["adm1_validation"]["uri"], adm1)
        _download(manifest["sources"]["adm2_boundaries"]["uri"], adm2)
        output = temp_dir / "mp-model-areas.geojson"
        build_manifest = temp_dir / "mp-model-areas.build.json"
        areas = build_mp_model_areas(
            adm1_path=adm1,
            adm2_path=adm2,
            crosswalk_path=args.crosswalk,
            source_manifest_path=args.source_manifest,
        )
        write_build_outputs(
            areas,
            output_path=output,
            build_manifest_path=build_manifest,
            source_manifest_path=args.source_manifest,
            crosswalk_path=args.crosswalk,
        )
        spec = ModelReleaseSpec.model_validate(
            json.loads(args.model_release.read_text(encoding="utf-8"))
        )
        with get_session_factory()() as session:
            loaded = load_mp_model_area_geojson(session, output)
            release = register_model_release(
                session,
                spec,
                activate=args.activate_model,
            )
            release_id = release.id
            release_status = release.status
            session.commit()
        print(
            json.dumps(
                {
                    "areas": len(loaded),
                    "model_release": release_id,
                    "model_status": release_status,
                }
            )
        )


def _download(url: str, destination: Path) -> None:
    context = ssl.create_default_context(cafile=certifi.where())
    request = urllib.request.Request(url, headers={"User-Agent": "CHART/0.1"})
    with urllib.request.urlopen(request, context=context, timeout=60) as response:
        with destination.open("wb") as output:
            shutil.copyfileobj(response, output)
