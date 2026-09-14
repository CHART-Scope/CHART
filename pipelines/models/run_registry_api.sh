#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
export MODEL_CACHE_DIR="${MODEL_CACHE_DIR:-/models}"
export PORT="${PORT:-8000}"
export HOST="${HOST:-0.0.0.0}"
cd "$HERE"
exec Rscript inference/api_registry.R
