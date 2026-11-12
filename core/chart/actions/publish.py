"""Publish reviewed actions from Airtable as the public action feed.

Reads the three action tables, keeps rows whose Status is Published, copies
only the allowed fields (never contact details or reviewer notes), copies
images (Airtable's links expire within hours), validates the result against
the feed schema and writes ``actions.json`` plus ``images/`` to ``--out``.
With ``--upload`` it then copies them to S3 unless the actions equal the
live feed's: images first, a dated archive copy, and ``actions.json`` last,
so the live file only ever points at uploaded images.

    AIRTABLE_TOKEN=... python -m chart.actions.publish --out build/actions --upload

Needs only the standard library, pydantic and (for ``--upload``) the AWS CLI.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import re
import subprocess
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from .schemas import ActionFeed

DEFAULT_BASE_ID = "appNS86K5OE3iN0qU"
# Table name -> countries its rows apply to (empty: every country).
TABLES = {
    "Generic actions": [],
    "India-only actions": ["IN"],
    "Kenya-only actions": ["KE"],
}
# "India - Rationale" style columns carry a country's own wording.
COUNTRY_PREFIXES = {"India": "IN", "Kenya": "KE"}
TEXT_FIELDS = {
    "title": "Title",
    "summary": "Summary",
    "description": "Description and key steps",
    "cost_reasoning": "Cost reasoning",
    "rationale": "Rationale",
    "expected_outcomes": "Expected outcomes",
    "decision_trigger": "CHART decision trigger",
}
LIST_FIELDS = {
    "hazards": "Climate hazard",
    "health_outcomes": "Health outcome",
    "target_populations": "Target population",
    "action_types": "Action type",
    "levels": "Level",
    "departments": "Responsible department",
    "stakeholders": "Responsible stakeholders",
    "trigger_sources": "Trigger source",
}
COUNTRY_FIELDS = {
    "description": "Description and key steps",
    "rationale": "Rationale",
    "cost_reasoning": "Cost reasoning",
    "departments": "Responsible department",
    "stakeholders": "Responsible stakeholders",
}
TIMING = {
    "Before season": ["before"],
    "During season": ["during"],
    "After season": ["after"],
    "Year-round": ["before", "during", "after"],
}


def build_feed(records: dict[str, list[dict]]) -> dict:
    """The feed document for published rows, by table name."""

    actions = []
    for table, countries in TABLES.items():
        for record in records.get(table, []):
            fields = record["fields"]
            if fields.get("Status") != "Published":
                continue
            actions.append(_action(record["id"], fields, countries))
    actions.sort(key=lambda action: action["title"].casefold())
    return {
        "schema_version": 1,
        "published_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": "CHART actions (Airtable)",
        "actions": actions,
    }


def _action(record_id: str, fields: dict, countries: list[str]) -> dict:
    action: dict = {"id": record_id, "countries": countries}
    action.update({key: _text(fields.get(name)) for key, name in TEXT_FIELDS.items()})
    action.update({key: fields.get(name) or [] for key, name in LIST_FIELDS.items()})
    seasons = {
        s for timing in fields.get("Timing") or [] for s in TIMING.get(timing, [])
    }
    action["seasons"] = [s for s in ("before", "during", "after") if s in seasons]
    action["cost_level"] = fields.get("Cost level")
    action["references"] = parse_references(fields.get("References"))
    action["case_studies"] = parse_references(fields.get("Case studies"))
    action["images"] = fields.get("Image") or []
    action["by_country"] = {}
    for prefix, code in COUNTRY_PREFIXES.items():
        local = {
            key: fields.get(f"{prefix} - {name}")
            for key, name in COUNTRY_FIELDS.items()
            if fields.get(f"{prefix} - {name}")
        }
        if local:
            action["by_country"][code] = {
                key: _text(value) if isinstance(value, str) else value
                for key, value in local.items()
            }
    return action


def parse_references(text: str | None) -> list[dict]:
    """One reference per line: "Citation: https://…", a bare URL, or text."""

    references = []
    for line in (text or "").splitlines():
        line = line.strip()
        if not line:
            continue
        match = re.search(r"https?://\S+", line)
        if match is None:
            references.append({"citation": line, "url": None})
            continue
        citation = line[: match.start()].rstrip(" :–—-") or match.group(0)
        references.append({"citation": citation, "url": match.group(0)})
    return references


def copy_images(feed: dict, out: Path, public_url: str) -> None:
    """Download each Airtable attachment and point the feed at its public copy."""

    for action in feed["actions"]:
        copies = []
        for attachment in action["images"]:
            kind = attachment.get("type") or ""
            if not kind.startswith("image/"):
                continue
            name = attachment["id"] + (mimetypes.guess_extension(kind) or "")
            target = out / "images" / name
            target.parent.mkdir(parents=True, exist_ok=True)
            with urllib.request.urlopen(attachment["url"], timeout=60) as response:
                target.write_bytes(response.read())
            copies.append(
                {
                    "url": f"{public_url}/images/{name}",
                    "filename": attachment.get("filename") or name,
                }
            )
        action["images"] = copies


def fetch_records(api_url: str, base_id: str, token: str) -> dict[str, list[dict]]:
    records: dict[str, list[dict]] = {}
    for table in TABLES:
        rows: list[dict] = []
        offset = None
        while True:
            query = {"pageSize": "100", **({"offset": offset} if offset else {})}
            url = (
                f"{api_url}/v0/{base_id}/{urllib.parse.quote(table)}?"
                + urllib.parse.urlencode(query)
            )
            request = urllib.request.Request(
                url, headers={"Authorization": f"Bearer {token}"}
            )
            with urllib.request.urlopen(request, timeout=30) as response:
                page = json.load(response)
            rows.extend(page["records"])
            offset = page.get("offset")
            if not offset:
                break
        records[table] = rows
    return records


def upload(out: Path, bucket: str, prefix: str, stamp: str) -> None:
    target = f"s3://{bucket}/{prefix}"
    aws = ["aws", "s3", "cp", "--only-show-errors"]
    if (out / "images").is_dir():
        subprocess.run(
            [*aws, "--recursive", str(out / "images"), f"{target}/images/"], check=True
        )
    json_args = ["--content-type", "application/json"]
    feed = str(out / "actions.json")
    subprocess.run(
        [*aws, *json_args, feed, f"{target}/archive/{stamp}.json"], check=True
    )
    subprocess.run(
        [
            *aws,
            *json_args,
            "--cache-control",
            "max-age=300",
            feed,
            f"{target}/actions.json",
        ],
        check=True,
    )


def live_actions(url: str) -> list[dict] | None:
    """The actions in the published feed, or None when there is none yet."""

    try:
        with urllib.request.urlopen(url, timeout=30) as response:
            return json.load(response)["actions"]
    except (OSError, ValueError, KeyError):
        return None


def _text(value: str | None) -> str:
    return (value or "").strip()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--bucket", default="chart-actions-repository")
    parser.add_argument("--region", default="eu-north-1")
    parser.add_argument("--prefix", default="v1")
    parser.add_argument("--upload", action="store_true")
    parser.add_argument(
        "--allow-empty",
        action="store_true",
        help="publish even when no action is Published (normally refused)",
    )
    args = parser.parse_args(argv)
    token = os.environ.get("AIRTABLE_TOKEN", "").strip()
    if not token:
        print("Set AIRTABLE_TOKEN (read access to the actions base).", file=sys.stderr)
        return 2
    api_url = os.environ.get("AIRTABLE_API_URL", "https://api.airtable.com").rstrip("/")
    base_id = os.environ.get("AIRTABLE_BASE_ID", DEFAULT_BASE_ID)
    public_url = f"https://{args.bucket}.s3.{args.region}.amazonaws.com/{args.prefix}"

    feed = build_feed(fetch_records(api_url, base_id, token))
    if not feed["actions"] and not args.allow_empty:
        print(
            "No Published actions; refusing to publish an empty feed.", file=sys.stderr
        )
        return 1
    args.out.mkdir(parents=True, exist_ok=True)
    copy_images(feed, args.out, public_url)
    ActionFeed.model_validate(feed)
    (args.out / "actions.json").write_text(
        json.dumps(feed, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"Wrote {len(feed['actions'])} published actions to {args.out}")
    if args.upload:
        if feed["actions"] == live_actions(f"{public_url}/actions.json"):
            print("No change since the live feed; nothing uploaded.")
            return 0
        stamp = feed["published_at"].replace(":", "").replace("+0000", "Z")
        upload(args.out, args.bucket, args.prefix, stamp)
        print(f"Uploaded to {public_url}/actions.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
