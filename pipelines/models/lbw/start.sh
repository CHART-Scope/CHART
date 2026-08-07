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

# The AWS CLI defaults to us-east-1 without credentials, and HeadObject on a
# bucket in another region returns 403. Detect the bucket region up front via
# an anonymous HTTP HEAD so `aws s3 cp --no-sign-request` hits the right
# endpoint regardless of where the bucket lives.
if [ -z "${AWS_DEFAULT_REGION:-}" ]; then
  model_bucket="$(printf '%s\n' "$LBW_MODEL_STATE_S3_URI" | sed 's#^s3://##; s#/.*##')"
  detected_region="$(
    curl -sI "https://${model_bucket}.s3.amazonaws.com/" |
      tr -d '\r' |
      awk -F': ' 'tolower($1)=="x-amz-bucket-region"{print $2; exit}'
  )"
  if [ -n "$detected_region" ]; then
    export AWS_DEFAULT_REGION="$detected_region"
  fi
fi

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
