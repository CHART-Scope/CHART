from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from chart.shared.db.models import PredictionRequestRecord


def _json_request(
    url: str,
    *,
    access_token: str,
    payload: dict | None = None,
) -> tuple[int, dict]:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }
    request = urllib.request.Request(
        url,
        data=body,
        headers=headers,
        method="POST" if payload is not None else "GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read())


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Trigger and verify an on-demand climate-backed LBW prediction."
    )
    parser.add_argument("--api-url", default="http://127.0.0.1:3210")
    parser.add_argument("--dagster-ui-url", default="http://127.0.0.1:3000")
    parser.add_argument("--end-month", default="2020-12")
    parser.add_argument("--timeout", type=int, default=120)
    parser.add_argument(
        "--access-token",
        default=os.getenv("CHART_ACCESS_TOKEN"),
        help="Keycloak access token; defaults to CHART_ACCESS_TOKEN.",
    )
    args = parser.parse_args()

    if not args.access_token:
        print(
            "Set CHART_ACCESS_TOKEN or pass --access-token with a Keycloak token.",
            file=sys.stderr,
        )
        return 2

    payload = {
        "location_slug": "madhya-pradesh",
        "timeframe_id": "exposure_3m",
        "end_month": args.end_month,
        "outcome": {"type": "lbw", "trimester": 1},
    }
    status_code, response = _json_request(
        f"{args.api_url.rstrip('/')}/climate/predict",
        access_token=args.access_token,
        payload=payload,
    )
    print(json.dumps(response, indent=2))

    if status_code == 200:
        print("Completed prediction was reused; no new Dagster run was needed.")
        return 0
    if status_code != 202:
        print(f"Unexpected API response: HTTP {status_code}", file=sys.stderr)
        return 1

    request_id = response["request_id"]
    print(
        "Queued prediction request "
        f"{request_id}. Open {args.dagster_ui_url.rstrip('/')}/runs and filter by "
        f"prediction_request_id={request_id}."
    )

    deadline = time.monotonic() + args.timeout
    status_url = f"{args.api_url.rstrip('/')}{response['status_url']}"
    latest: dict = response
    while time.monotonic() < deadline:
        _, latest = _json_request(status_url, access_token=args.access_token)
        print(
            f"status={latest['status']} stage={latest['stage']} "
            f"dagster_run_id={latest.get('dagster_run_id')}"
        )
        if latest["status"] in {"completed", "failed"}:
            break
        time.sleep(2)
    else:
        print("Timed out waiting for Dagster.", file=sys.stderr)
        return 1

    if latest["status"] != "completed":
        print(json.dumps(latest, indent=2), file=sys.stderr)
        return 1

    database_url = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg://chart:chart@127.0.0.1:5434/chart",
    )
    engine = create_engine(database_url)
    with Session(engine) as session:
        record = session.scalar(
            select(PredictionRequestRecord).where(
                PredictionRequestRecord.id == request_id
            )
        )
        if record is None or record.result_payload is None:
            print("Completed request has no persisted result.", file=sys.stderr)
            return 1
        prediction = record.result_payload.get("prediction") or {}
        print(
            "Database result: "
            f"request_id={record.id} status={record.status} "
            f"climate_run_id={record.climate_run_id} "
            f"odds_ratio={prediction.get('odds_ratio')}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
