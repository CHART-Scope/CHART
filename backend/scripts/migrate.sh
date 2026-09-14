#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

case "$DATABASE_URL" in
  postgres://*)
    export DATABASE_URL="postgresql+psycopg://${DATABASE_URL#postgres://}"
    ;;
esac

if [ -z "${PYTHON_BIN:-}" ]; then
  if command -v python >/dev/null 2>&1; then
    PYTHON_BIN=python
  elif command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN=python3
  else
    echo "Python is required to run Alembic" >&2
    exit 1
  fi
fi

heads="$("$PYTHON_BIN" -m alembic heads)"
head_count="$(printf '%s\n' "$heads" | awk 'NF { count += 1 } END { print count + 0 }')"
if [ "$head_count" -ne 1 ]; then
  echo "Expected exactly one Alembic head, found $head_count:" >&2
  printf '%s\n' "$heads" >&2
  exit 1
fi

expected_head="$(printf '%s\n' "$heads" | awk 'NF { print $1; exit }')"
"$PYTHON_BIN" -m alembic upgrade head
current_revision="$("$PYTHON_BIN" -m alembic current | awk 'NF { print $1; exit }')"

if [ "$current_revision" != "$expected_head" ]; then
  echo "Alembic migration verification failed: expected $expected_head, got ${current_revision:-none}" >&2
  exit 1
fi

echo "Alembic database revision verified at $current_revision"
