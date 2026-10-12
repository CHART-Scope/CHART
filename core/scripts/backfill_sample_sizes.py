"""Fill the fitted sample into results scored before it was stored.

The sample a result stands on (births and low-birth-weight cases, or deaths)
belongs to the fitted block that scored it, and every artifact carries it. Old
results never stored it, so the details panel had nothing to show. This reads
each release's artifact once and copies its counts onto that release's results,
filling only fields that are empty.

    python core/scripts/backfill_sample_sizes.py            # report only
    python core/scripts/backfill_sample_sizes.py --apply    # write

Needs DATABASE_URL and Rscript; artifacts are found as the runtime finds them
(MODEL_CACHE_DIR, defaulting to pipelines/models).
"""

from __future__ import annotations

import argparse
import json
import subprocess
from collections import Counter
from pathlib import Path

from sqlalchemy import select

from chart.model_registry.runtime import locate_model_artifact
from chart.shared.db.models import ModelAreaMapping, ModelRelease, PredictionResult
from chart.shared.db.session import get_session_factory

HELPER = (
    Path(__file__).resolve().parents[2] / "pipelines/models/inference/sample_sizes.R"
)
FIELDS = ("n_training", "n_events", "n_subjects")


def artifact_samples(path: Path) -> dict:
    output = subprocess.run(
        ["Rscript", str(HELPER), str(path)], check=True, capture_output=True, text=True
    ).stdout
    return json.loads(output)


def backfill(*, apply: bool) -> Counter:
    tally: Counter = Counter()
    with get_session_factory()() as session:
        releases = {
            release.id: release for release in session.scalars(select(ModelRelease))
        }
        area_of = {
            (mapping.model_release_id, mapping.admin_unit_id): (
                mapping.model_area_key,
                mapping.model_file,
            )
            for mapping in session.scalars(select(ModelAreaMapping))
        }
        samples: dict[str, dict] = {}
        rows = session.scalars(
            select(PredictionResult).where(
                (PredictionResult.n_training.is_(None))
                | (PredictionResult.n_events.is_(None))
            )
        )
        for row in rows:
            tally["results without a full sample"] += 1
            area, model_file = area_of.get(
                (row.model_release_id, row.admin_unit_id), (None, None)
            )
            release = releases.get(row.model_release_id)
            sha = next(
                (
                    item.get("sha256")
                    for item in (release.model_files if release else [])
                    if item.get("filename") == model_file
                ),
                None,
            )
            if area is None or sha is None:
                tally["skipped: no model mapping"] += 1
                continue
            if model_file not in samples:
                try:
                    samples[model_file] = artifact_samples(
                        locate_model_artifact(model_file, sha)
                    )
                except Exception as error:  # noqa: BLE001 - reported, not fatal
                    print(f"cannot read {model_file}: {error}")
                    samples[model_file] = {}
            block = samples[model_file].get(area, {}).get(str(row.pregnancy_window))
            if not block:
                tally["skipped: block not in artifact"] += 1
                continue
            changed = False
            for field in FIELDS:
                if getattr(row, field) is None and block.get(field):
                    setattr(row, field, int(block[field]))
                    changed = True
            tally["filled" if changed else "nothing to fill"] += 1
        if apply:
            session.commit()
        else:
            session.rollback()
    return tally


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="write the counts")
    args = parser.parse_args()
    tally = backfill(apply=args.apply)
    for key, value in sorted(tally.items()):
        print(f"{key}: {value}")
    print("written" if args.apply else "dry run: nothing written (pass --apply)")


if __name__ == "__main__":
    main()
