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

alembic upgrade head
