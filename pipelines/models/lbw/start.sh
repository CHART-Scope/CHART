#!/usr/bin/env bash
set -euo pipefail

: "${LBW_MODEL_DIVISION_S3_URI:?Set LBW_MODEL_DIVISION_S3_URI to the division model s3:// bucket/key URI.}"
: "${LBW_MODEL_STATE_S3_URI:?Set LBW_MODEL_STATE_S3_URI to the state model s3:// bucket/key URI.}"
: "${LBW_MODEL_DIVISION_SHA256:?Set LBW_MODEL_DIVISION_SHA256 from model-release.json.}"
: "${LBW_MODEL_STATE_SHA256:?Set LBW_MODEL_STATE_SHA256 from model-release.json.}"
: "${LBW_MODEL_RELEASE_ID:?Set LBW_MODEL_RELEASE_ID from model-release.json.}"
: "${LBW_MODEL_VERSION:?Set LBW_MODEL_VERSION from model-release.json.}"

model_dir="${LBW_MODEL_DIR:-/models}"
division_file="$(basename "${LBW_MODEL_DIVISION_S3_URI}")"
state_file="$(basename "${LBW_MODEL_STATE_S3_URI}")"
division_path="${model_dir}/${division_file}"
state_path="${model_dir}/${state_file}"

mkdir -p "$model_dir"

ensure_model() {
  local uri="$1"
  local path="$2"
  local expected_sha256="$3"
  local label="$4"
  local temporary

  if [ -s "$path" ] && printf '%s  %s\n' "$expected_sha256" "$path" | sha256sum -c - >/dev/null 2>&1; then
    echo "Using verified cached $label model."
    return
  fi

  temporary="$(mktemp "${path}.partial.XXXXXX")"
  trap 'rm -f "$temporary"' RETURN
  echo "Downloading $label LBW model from S3..."
  aws s3 cp --no-sign-request "$uri" "$temporary"
  printf '%s  %s\n' "$expected_sha256" "$temporary" | sha256sum -c -
  mv "$temporary" "$path"
  trap - RETURN
}

ensure_model \
  "$LBW_MODEL_DIVISION_S3_URI" \
  "$division_path" \
  "$LBW_MODEL_DIVISION_SHA256" \
  "division"
ensure_model \
  "$LBW_MODEL_STATE_S3_URI" \
  "$state_path" \
  "$LBW_MODEL_STATE_SHA256" \
  "state"

export LBW_MODEL_DIVISION="$division_path"
export LBW_MODEL_STATE="$state_path"
export LBW_MODEL_DIVISION_SHA256
export LBW_MODEL_STATE_SHA256
export LBW_MODEL_RELEASE_ID
export LBW_MODEL_VERSION

exec Rscript inference/api.R
