from __future__ import annotations

import argparse
import json
from pathlib import Path

from chart.shared.db.session import get_session_factory

from .load import load_mp_model_area_geojson


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Load the generated Madhya Pradesh model-area polygons."
    )
    parser.add_argument("geojson", type=Path)
    args = parser.parse_args()

    session_factory = get_session_factory()
    with session_factory.begin() as session:
        loaded = load_mp_model_area_geojson(session, args.geojson)

    print(json.dumps({"loaded": len(loaded), "areas": list(loaded)}, indent=2))


if __name__ == "__main__":
    main()
