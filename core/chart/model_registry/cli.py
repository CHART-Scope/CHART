from __future__ import annotations

import argparse
import json
from pathlib import Path

from chart.shared.db.session import get_session_factory

from .schemas import ModelReleaseSpec
from .service import register_model_release


def main() -> None:
    parser = argparse.ArgumentParser(description="Register a CHART model release.")
    parser.add_argument("release_file", type=Path)
    parser.add_argument("--model-dir", type=Path)
    parser.add_argument("--activate", action="store_true")
    args = parser.parse_args()

    spec = ModelReleaseSpec.model_validate(
        json.loads(args.release_file.read_text(encoding="utf-8"))
    )
    with get_session_factory()() as session:
        release = register_model_release(
            session,
            spec,
            model_dir=args.model_dir,
            activate=args.activate,
        )
        session.commit()
        print(f"registered {release.id} ({release.status})")
