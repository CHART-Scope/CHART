"""Export the climate API OpenAPI document for docs and CI."""

from __future__ import annotations

import argparse
from pathlib import Path

from chart.api.app import export_openapi


def main() -> None:
    parser = argparse.ArgumentParser(description="Write CHART climate OpenAPI JSON.")
    parser.add_argument(
        "--output",
        default="docs/openapi/climate.json",
        help="Output path for openapi.json (default: docs/openapi/climate.json)",
    )
    args = parser.parse_args()
    path = export_openapi(Path(args.output))
    print(path)


if __name__ == "__main__":
    main()
