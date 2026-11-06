"""Local stand-in for the external services the live suite would otherwise call.

The live suite never calls a real provider. This serves, on loopback, the same
HTTP contracts CHART uses:

- an OpenAI-compatible model server (``/v1/models``, ``/v1/chat/completions``)
  and the classifier's ``/rank``;
- the Airtable records API (``/v0/<base>/<table>``, two rows per page) over
  ``--airtable`` fixture records, and their image attachments;
- the public action feed (``/v1/actions.json``), read from ``--feed``.

It records each request it receives (whether it carried an Authorization
header, never the header itself) and can be told to fail through ``/control``.

    python e2e/stub_ai_server.py --port 8123 --log requests.jsonl \
        --airtable e2e/fixtures/airtable_actions.json --feed feed/actions.json
"""

from __future__ import annotations

import argparse
import base64
import json
import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

MODELS = ["stub-fail", "stub-small"]
# feed: "ok" serves --feed, "down" answers 503, "invalid" adds a field the
# feed schema forbids. airtable_empty: every table has no rows.
STATE = {"rank_fail": False, "feed": "ok", "airtable_empty": False}
LOCK = threading.Lock()
AIRTABLE_TOKEN = "e2e-airtable-token"
PAGE_SIZE = 2
# A 1x1 transparent PNG.
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


def make_handler(log: Path, airtable: Path | None, feed: Path | None):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def _reply(self, status: int, body: dict) -> None:
            self._send(status, json.dumps(body).encode(), "application/json")

        def _send(self, status: int, data: bytes, kind: str) -> None:
            self.send_response(status)
            self.send_header("Content-Type", kind)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def _record(self, body: dict | None) -> None:
            entry = {
                "method": self.command,
                "path": self.path,
                "authorization": "Authorization" in self.headers,
                "body": body,
            }
            with LOCK, log.open("a") as handle:
                handle.write(json.dumps(entry) + "\n")

        def do_GET(self):
            self._record(None)
            if self.path == "/health":
                return self._reply(200, {"ok": True})
            if self.path == "/v1/models":
                return self._reply(200, {"data": [{"id": m} for m in MODELS]})
            url = urllib.parse.urlsplit(self.path)
            if url.path == "/v1/actions.json" and feed is not None:
                return self._feed()
            if url.path.startswith("/v0/") and airtable is not None:
                return self._airtable(url)
            if url.path.startswith("/attachments/"):
                return self._send(200, PNG, "image/png")
            return self._reply(404, {"error": "not found"})

        def _feed(self):
            if STATE["feed"] == "down" or not feed.is_file():
                return self._reply(503, {"error": "feed unavailable"})
            body = json.loads(feed.read_text())
            if STATE["feed"] == "invalid":
                body["actions"][0]["contact_email"] = "leak@example.org"
            return self._reply(200, body)

        def _airtable(self, url):
            if self.headers.get("Authorization") != f"Bearer {AIRTABLE_TOKEN}":
                return self._reply(401, {"error": {"type": "AUTHENTICATION_REQUIRED"}})
            table = urllib.parse.unquote(url.path.split("/")[3])
            host, port = self.server.server_address[:2]
            fixture = json.loads(
                airtable.read_text().replace("{stub}", f"http://{host}:{port}")
            )
            rows = [] if STATE["airtable_empty"] else fixture.get(table)
            if rows is None:
                return self._reply(404, {"error": {"type": "TABLE_NOT_FOUND"}})
            start = int(urllib.parse.parse_qs(url.query).get("offset", ["0"])[0])
            page = {"records": rows[start : start + PAGE_SIZE]}
            if start + PAGE_SIZE < len(rows):
                page["offset"] = str(start + PAGE_SIZE)
            return self._reply(200, page)

        def do_POST(self):
            length = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(length) or b"{}")
            self._record(body)
            if self.path == "/control":
                STATE.update(body)
                return self._reply(200, STATE)
            if self.path == "/v1/chat/completions":
                if body.get("model") == "stub-fail":
                    return self._reply(500, {"error": "stub failure"})
                prompt = body["messages"][-1]["content"]
                place = next(
                    (
                        line[7:]
                        for line in prompt.splitlines()
                        if line.startswith("Place: ")
                    ),
                    "unknown",
                )
                text = f"Stub insight for {place}: start with the first action."
                return self._reply(
                    200,
                    {"choices": [{"message": {"role": "assistant", "content": text}}]},
                )
            if self.path == "/rank":
                if STATE["rank_fail"]:
                    return self._reply(503, {"error": "classifier down"})
                # Reverse the offered order so a classifier ranking is visible.
                ids = [candidate["id"] for candidate in body["candidates"]]
                scores = {cid: float(index) for index, cid in enumerate(ids)}
                return self._reply(
                    200, {"model": "stub-classifier-v1", "scores": scores}
                )
            return self._reply(404, {"error": "not found"})

    return Handler


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--log", type=Path, required=True)
    parser.add_argument("--airtable", type=Path)
    parser.add_argument("--feed", type=Path)
    args = parser.parse_args()
    ThreadingHTTPServer(
        ("127.0.0.1", args.port), make_handler(args.log, args.airtable, args.feed)
    ).serve_forever()


if __name__ == "__main__":
    main()
