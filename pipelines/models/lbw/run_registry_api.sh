#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
export MODEL_CACHE_DIR="${MODEL_CACHE_DIR:-$HERE/model}"
export PORT="${PORT:-8000}"
cd "$HERE"
exec Rscript inference/api_registry.R
