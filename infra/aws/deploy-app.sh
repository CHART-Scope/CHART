#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/chart}"
ENV_DIR="${ENV_DIR:-/opt/chart-env}"
ENV_FILE="${ENV_FILE:-$ENV_DIR/chart.env}"
PREDICTION_ENV_FILE="${PREDICTION_ENV_FILE:-$ENV_DIR/prediction-worker.env}"
WEB_ENV_FILE="${WEB_ENV_FILE:-$ENV_DIR/web.env}"
DAGSTER_ENV_FILE="${DAGSTER_ENV_FILE:-$ENV_DIR/dagster.env}"
NETWORK="${NETWORK:-chart-net}"

DB_CONTAINER="${DB_CONTAINER:-chart-postgres}"
LEGACY_KEYCLOAK_DB_CONTAINER="${LEGACY_KEYCLOAK_DB_CONTAINER:-chart-keycloak-postgres}"
KEYCLOAK_CONTAINER="${KEYCLOAK_CONTAINER:-chart-keycloak}"
API_CONTAINER="${API_CONTAINER:-chart-api}"
WEB_CONTAINER="${WEB_CONTAINER:-chart-web}"
LBW_CONTAINER="${LBW_CONTAINER:-chart-lbw}"
DAGSTER_WEBSERVER_CONTAINER="${DAGSTER_WEBSERVER_CONTAINER:-chart-dagster-webserver}"
DAGSTER_DAEMON_CONTAINER="${DAGSTER_DAEMON_CONTAINER:-chart-dagster-daemon}"
PROXY_CONTAINER="${PROXY_CONTAINER:-chart-proxy}"

DB_NAME="${DB_NAME:-chart}"
DAGSTER_DB_NAME="chart_dagster"
KEYCLOAK_DB_NAME="${KEYCLOAK_DB_NAME:-chart_keycloak}"
KEYCLOAK_DB_USER="chart_keycloak"
DB_USER="${DB_USER:-chart}"
WEB_IMAGE="${WEB_IMAGE:-chart-web:latest}"
LBW_IMAGE="${LBW_IMAGE:-chart-lbw:latest}"
PYTHON_IMAGE="${PYTHON_IMAGE:-chart-python:latest}"
PROXY_CONFIG_FILE="${PROXY_CONFIG_FILE:-$ENV_DIR/nginx.conf}"

random_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 24
    return
  fi

  date +%s%N | sha256sum | cut -c 1-48
}

read_env_value() {
  local file="$1"
  local key="$2"
  local line
  if [ ! -f "$file" ]; then
    return
  fi
  line="$(grep -m 1 "^${key}=" "$file" 2>/dev/null || true)"
  printf "%s" "${line#*=}"
}

detect_public_host() {
  if [ -n "${PUBLIC_HOST:-}" ]; then
    printf "%s" "$PUBLIC_HOST"
    return
  fi

  curl -fsS https://checkip.amazonaws.com 2>/dev/null | tr -d "[:space:]"
}

wait_for_command() {
  local description="$1"
  shift

  for _ in $(seq 1 60); do
    if "$@" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done

  echo "Timed out waiting for $description" >&2
  return 1
}

migrate_legacy_keycloak_database() {
  if docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$KEYCLOAK_DB_NAME" -Atc \
    "SELECT to_regclass('public.databasechangelog') IS NOT NULL" | grep -qx t; then
    return
  fi

  if ! docker volume inspect chart-keycloak-postgres-data >/dev/null 2>&1; then
    return
  fi

  if docker container inspect "$LEGACY_KEYCLOAK_DB_CONTAINER" >/dev/null 2>&1; then
    docker start "$LEGACY_KEYCLOAK_DB_CONTAINER" >/dev/null
  else
    docker run -d \
      --name "$LEGACY_KEYCLOAK_DB_CONTAINER" \
      --network "$NETWORK" \
      -e POSTGRES_DB="$KEYCLOAK_DB_NAME" \
      -e POSTGRES_USER="$DB_USER" \
      -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
      -v chart-keycloak-postgres-data:/var/lib/postgresql/data \
      postgres:16-alpine >/dev/null
  fi

  wait_for_command "legacy Keycloak Postgres" \
    docker exec "$LEGACY_KEYCLOAK_DB_CONTAINER" \
    pg_isready -U "$DB_USER" -d "$KEYCLOAK_DB_NAME"

  local dump_file
  dump_file="$(mktemp)"
  if ! docker exec "$LEGACY_KEYCLOAK_DB_CONTAINER" \
    pg_dump -U "$DB_USER" -d "$KEYCLOAK_DB_NAME" \
    --no-owner --no-privileges >"$dump_file"; then
    rm -f "$dump_file"
    return 1
  fi

  if ! docker exec -i -e PGPASSWORD="$KEYCLOAK_DB_PASSWORD" "$DB_CONTAINER" \
    psql -v ON_ERROR_STOP=1 --single-transaction \
    -h 127.0.0.1 -U "$KEYCLOAK_DB_USER" -d "$KEYCLOAK_DB_NAME" <"$dump_file"; then
    rm -f "$dump_file"
    return 1
  fi

  rm -f "$dump_file"
  echo "Migrated the legacy Keycloak database into $DB_CONTAINER."
}

if [ -n "${PUBLIC_ORIGIN:-}" ]; then
  if [[ ! "$PUBLIC_ORIGIN" =~ ^(https?)://([A-Za-z0-9.-]+(:[0-9]{1,5})?)$ ]]; then
    echo "PUBLIC_ORIGIN must be an http(s) origin without a path." >&2
    exit 1
  fi
  PUBLIC_SCHEME="${BASH_REMATCH[1]}"
  PUBLIC_HOST="${BASH_REMATCH[2]}"
else
  PUBLIC_HOST="$(detect_public_host)"
  PUBLIC_SCHEME="${PUBLIC_SCHEME:-https}"
  PUBLIC_ORIGIN="$PUBLIC_SCHEME://$PUBLIC_HOST"
fi
TLS_TERMINATED_UPSTREAM="${TLS_TERMINATED_UPSTREAM:-0}"
ALLOW_INSECURE_HTTP="${ALLOW_INSECURE_HTTP:-0}"

if [ -z "$PUBLIC_HOST" ]; then
  echo "Set PUBLIC_HOST to the public host or IP used by browsers." >&2
  exit 1
fi

if [[ "$PUBLIC_HOST" == http://* || "$PUBLIC_HOST" == https://* || "$PUBLIC_HOST" == */* ]]; then
  echo "Set PUBLIC_HOST to a bare hostname or IP without a scheme or path." >&2
  exit 1
fi
if [[ ! "$PUBLIC_HOST" =~ ^[A-Za-z0-9.-]+(:[0-9]{1,5})?$ ]]; then
  echo "PUBLIC_HOST contains invalid characters." >&2
  exit 1
fi
if [[ "$PUBLIC_HOST" == *:* ]]; then
  PUBLIC_PORT="${PUBLIC_HOST##*:}"
  if [ "$PUBLIC_PORT" -lt 1 ] || [ "$PUBLIC_PORT" -gt 65535 ]; then
    echo "PUBLIC_HOST contains an invalid port." >&2
    exit 1
  fi
fi
for identifier in "$DB_NAME" "$DAGSTER_DB_NAME" "$KEYCLOAK_DB_NAME" "$DB_USER" "$KEYCLOAK_DB_USER"; do
  if [[ ! "$identifier" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    echo "Database names and users must be safe PostgreSQL identifiers." >&2
    exit 1
  fi
done
for docker_name in \
  "$NETWORK" "$DB_CONTAINER" "$LEGACY_KEYCLOAK_DB_CONTAINER" \
  "$KEYCLOAK_CONTAINER" "$API_CONTAINER" "$WEB_CONTAINER" "$LBW_CONTAINER" \
  "$DAGSTER_WEBSERVER_CONTAINER" "$DAGSTER_DAEMON_CONTAINER" "$PROXY_CONTAINER"; do
  if [[ ! "$docker_name" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]]; then
    echo "Docker network and container names contain invalid characters." >&2
    exit 1
  fi
done

if [ "$PUBLIC_SCHEME" != "https" ] && [ "$PUBLIC_SCHEME" != "http" ]; then
  echo "PUBLIC_SCHEME must be https or http." >&2
  exit 1
fi
if [[ "$PUBLIC_HOST" != *:* ]]; then
  if [ "$PUBLIC_SCHEME" = "https" ]; then
    PUBLIC_PORT=443
  else
    PUBLIC_PORT=80
  fi
fi
if [ "$PUBLIC_SCHEME" = "http" ] && [ "$ALLOW_INSECURE_HTTP" != "1" ]; then
  echo "Plain HTTP is disabled. Configure TLS or explicitly set ALLOW_INSECURE_HTTP=1 for an isolated development deployment." >&2
  exit 1
fi
if [ "$PUBLIC_SCHEME" = "https" ] && [ "$TLS_TERMINATED_UPSTREAM" != "1" ]; then
  if [ ! -r "${TLS_CERT_FILE:-}" ] || [ ! -r "${TLS_KEY_FILE:-}" ]; then
    echo "HTTPS requires readable TLS_CERT_FILE and TLS_KEY_FILE, or TLS_TERMINATED_UPSTREAM=1 behind an HTTPS load balancer." >&2
    exit 1
  fi
fi

mkdir -p "$ENV_DIR"

DEPLOY_CDSAPI_KEY="${CDSAPI_KEY:-}"
DEPLOY_CDSAPI_URL="${CDSAPI_URL:-}"
DEPLOY_INFERENCE_LLM_ENABLED="${INFERENCE_LLM_ENABLED:-}"
DEPLOY_INFERENCE_LLM_BASE_URL="${INFERENCE_LLM_BASE_URL:-}"
DEPLOY_INFERENCE_LLM_MODEL="${INFERENCE_LLM_MODEL:-}"
DEPLOY_INFERENCE_LLM_API_KEY="${INFERENCE_LLM_API_KEY:-}"

PERSISTED_POSTGRES_PASSWORD="$(read_env_value "$ENV_FILE" POSTGRES_PASSWORD)"
PERSISTED_KEYCLOAK_ADMIN_PASSWORD="$(
  read_env_value "$ENV_FILE" KEYCLOAK_ADMIN_PASSWORD
)"
PERSISTED_CHART_BOOTSTRAP_TOKEN="$(
  read_env_value "$ENV_FILE" CHART_BOOTSTRAP_TOKEN
)"
PERSISTED_MODEL_CONTROL_TOKEN="$(
  read_env_value "$ENV_FILE" MODEL_CONTROL_TOKEN
)"
PERSISTED_CDSAPI_KEY="$(read_env_value "$PREDICTION_ENV_FILE" CDSAPI_KEY)"
PERSISTED_CDSAPI_URL="$(read_env_value "$PREDICTION_ENV_FILE" CDSAPI_URL)"
PERSISTED_INFERENCE_LLM_ENABLED="$(
  read_env_value "$PREDICTION_ENV_FILE" INFERENCE_LLM_ENABLED
)"
PERSISTED_INFERENCE_LLM_BASE_URL="$(
  read_env_value "$PREDICTION_ENV_FILE" INFERENCE_LLM_BASE_URL
)"
PERSISTED_INFERENCE_LLM_MODEL="$(
  read_env_value "$PREDICTION_ENV_FILE" INFERENCE_LLM_MODEL
)"
PERSISTED_INFERENCE_LLM_API_KEY="$(
  read_env_value "$PREDICTION_ENV_FILE" INFERENCE_LLM_API_KEY
)"

POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-${PERSISTED_POSTGRES_PASSWORD:-$(random_secret)}}"
KEYCLOAK_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-${PERSISTED_KEYCLOAK_ADMIN_PASSWORD:-$(random_secret)}}"
CHART_BOOTSTRAP_TOKEN="${CHART_BOOTSTRAP_TOKEN:-${PERSISTED_CHART_BOOTSTRAP_TOKEN:-$(random_secret)}}"
MODEL_CONTROL_TOKEN="${MODEL_CONTROL_TOKEN:-${PERSISTED_MODEL_CONTROL_TOKEN:-$(random_secret)}}"
KEYCLOAK_DB_PASSWORD="$(random_secret)"
CDSAPI_KEY="${DEPLOY_CDSAPI_KEY:-$PERSISTED_CDSAPI_KEY}"
CDSAPI_URL="${DEPLOY_CDSAPI_URL:-${PERSISTED_CDSAPI_URL:-https://cds.climate.copernicus.eu/api}}"
INFERENCE_LLM_ENABLED="${DEPLOY_INFERENCE_LLM_ENABLED:-${PERSISTED_INFERENCE_LLM_ENABLED:-false}}"
INFERENCE_LLM_BASE_URL="${DEPLOY_INFERENCE_LLM_BASE_URL:-$PERSISTED_INFERENCE_LLM_BASE_URL}"
INFERENCE_LLM_MODEL="${DEPLOY_INFERENCE_LLM_MODEL:-$PERSISTED_INFERENCE_LLM_MODEL}"
INFERENCE_LLM_API_KEY="${DEPLOY_INFERENCE_LLM_API_KEY:-$PERSISTED_INFERENCE_LLM_API_KEY}"

for name in \
  POSTGRES_PASSWORD KEYCLOAK_ADMIN_PASSWORD CHART_BOOTSTRAP_TOKEN \
  MODEL_CONTROL_TOKEN \
  CDSAPI_KEY CDSAPI_URL \
  INFERENCE_LLM_BASE_URL INFERENCE_LLM_MODEL INFERENCE_LLM_API_KEY; do
  value="${!name}"
  if [[ "$value" == *$'\n'* || "$value" == *$'\r'* ]]; then
    echo "$name must be a single-line environment value." >&2
    exit 1
  fi
done
if [[ ! "$POSTGRES_PASSWORD" =~ ^[A-Za-z0-9._~-]+$ ]]; then
  echo "POSTGRES_PASSWORD must be URL-safe because it is embedded in database URLs." >&2
  exit 1
fi

LBW_ENABLED=1
INFERENCE_LBW_BASE_URL="http://$LBW_CONTAINER:8000"

if [ -z "$CDSAPI_KEY" ]; then
  echo "ERA5 downloads disabled: CDSAPI_KEY is not configured."
fi

PYTHON_DATABASE_URL="postgresql+psycopg://$DB_USER:$POSTGRES_PASSWORD@$DB_CONTAINER:5432/$DB_NAME"

cat >"$ENV_FILE" <<EOF
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
KEYCLOAK_ADMIN_PASSWORD=$KEYCLOAK_ADMIN_PASSWORD
DATABASE_URL=postgres://$DB_USER:$POSTGRES_PASSWORD@$DB_CONTAINER:5432/$DB_NAME
PYTHON_DATABASE_URL=$PYTHON_DATABASE_URL
DAGSTER_HOME=/opt/dagster/dagster_home
DAGSTER_POSTGRES_HOST=$DB_CONTAINER
DAGSTER_POSTGRES_PORT=5432
DAGSTER_POSTGRES_USER=$DB_USER
DAGSTER_POSTGRES_PASSWORD=$POSTGRES_PASSWORD
DAGSTER_POSTGRES_DB=$DAGSTER_DB_NAME
CLIMATE_OUTPUT_DIR=/opt/chart/data/climate
ERA5_USE_FIXTURE=0
KEYCLOAK_ISSUER_URL=$PUBLIC_ORIGIN/identity/realms/chart
KEYCLOAK_CLIENT_ID=chart-api
KEYCLOAK_JWKS_URL=http://$KEYCLOAK_CONTAINER:8080/identity/realms/chart/protocol/openid-connect/certs
KEYCLOAK_CLOCK_SKEW_SECONDS=30
KEYCLOAK_SERVER_URL=http://$KEYCLOAK_CONTAINER:8080/identity
KEYCLOAK_BROWSER_URL=$PUBLIC_ORIGIN/identity
KEYCLOAK_ADMIN_URL=http://$KEYCLOAK_CONTAINER:8080/identity
KEYCLOAK_ADMIN_USERNAME=admin
KEYCLOAK_REALM=chart
KEYCLOAK_WEB_CLIENT_ID=chart-web
CHART_API_INTERNAL_URL=http://$API_CONTAINER:3210
CHART_PYTHON_API_INTERNAL_URL=http://$API_CONTAINER:3210
CHART_CORS_ORIGINS=$PUBLIC_ORIGIN
CHART_WEB_ORIGIN=$PUBLIC_ORIGIN
CHART_BOOTSTRAP_TOKEN=$CHART_BOOTSTRAP_TOKEN
CHART_REQUIRE_ACTIVE_MODEL=${LBW_ENABLED:-0}
INFERENCE_LBW_BASE_URL=$INFERENCE_LBW_BASE_URL
MODEL_CONTROL_TOKEN=$MODEL_CONTROL_TOKEN
MODEL_CACHE_DIR=/models
EOF

chmod 600 "$ENV_FILE"

cat >"$WEB_ENV_FILE" <<EOF
CHART_API_INTERNAL_URL=http://$API_CONTAINER:3210
CHART_PYTHON_API_INTERNAL_URL=http://$API_CONTAINER:3210
CHART_WEB_ORIGIN=$PUBLIC_ORIGIN
CHART_BOOTSTRAP_TOKEN=$CHART_BOOTSTRAP_TOKEN
KEYCLOAK_BROWSER_URL=$PUBLIC_ORIGIN/identity
KEYCLOAK_SERVER_URL=http://$KEYCLOAK_CONTAINER:8080/identity
KEYCLOAK_REALM=chart
KEYCLOAK_WEB_CLIENT_ID=chart-web
EOF

chmod 600 "$WEB_ENV_FILE"

cat >"$DAGSTER_ENV_FILE" <<EOF
PYTHON_DATABASE_URL=$PYTHON_DATABASE_URL
DAGSTER_HOME=/opt/dagster/dagster_home
DAGSTER_POSTGRES_HOST=$DB_CONTAINER
DAGSTER_POSTGRES_PORT=5432
DAGSTER_POSTGRES_USER=$DB_USER
DAGSTER_POSTGRES_PASSWORD=$POSTGRES_PASSWORD
DAGSTER_POSTGRES_DB=$DAGSTER_DB_NAME
CLIMATE_OUTPUT_DIR=/opt/chart/data/climate
ERA5_USE_FIXTURE=0
EOF

chmod 600 "$DAGSTER_ENV_FILE"

cat >"$PREDICTION_ENV_FILE" <<EOF
CDSAPI_URL=$CDSAPI_URL
CDSAPI_KEY=$CDSAPI_KEY
INFERENCE_STATISTICAL_PROVIDER=lbw_r
INFERENCE_LBW_BASE_URL=$INFERENCE_LBW_BASE_URL
INFERENCE_LLM_ENABLED=$INFERENCE_LLM_ENABLED
INFERENCE_LLM_BASE_URL=$INFERENCE_LLM_BASE_URL
INFERENCE_LLM_MODEL=$INFERENCE_LLM_MODEL
INFERENCE_LLM_API_KEY=$INFERENCE_LLM_API_KEY
INFERENCE_LLM_TIMEOUT_SECONDS=10
EOF

chmod 600 "$PREDICTION_ENV_FILE"

NGINX_LISTEN="listen 80;"
NGINX_REDIRECT_SERVER=""
PROXY_PORT_ARGS=(-p 80:80)
PROXY_TLS_ARGS=()
if [ "$PUBLIC_SCHEME" = "https" ] && [ "$TLS_TERMINATED_UPSTREAM" != "1" ]; then
  NGINX_LISTEN="$(cat <<EOF
    listen 443 ssl;
    ssl_certificate /etc/nginx/tls/cert.pem;
    ssl_certificate_key /etc/nginx/tls/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
EOF
)"
  NGINX_REDIRECT_SERVER="$(cat <<EOF
  server {
    listen 80;
    return 308 $PUBLIC_ORIGIN\$request_uri;
  }
EOF
)"
  PROXY_PORT_ARGS+=(-p 443:443)
  PROXY_TLS_ARGS+=(
    -v "$TLS_CERT_FILE:/etc/nginx/tls/cert.pem:ro"
    -v "$TLS_KEY_FILE:/etc/nginx/tls/key.pem:ro"
  )
fi

cat >"$PROXY_CONFIG_FILE" <<EOF
events {}

http {
$NGINX_REDIRECT_SERVER
  server {
$NGINX_LISTEN
    client_max_body_size 25m;

    if (\$http_host != "$PUBLIC_HOST") {
      return 308 $PUBLIC_ORIGIN\$request_uri;
    }

    location = /identity {
      return 302 /identity/;
    }

    location /identity/ {
      proxy_pass http://$KEYCLOAK_CONTAINER:8080;
      proxy_set_header Host $PUBLIC_HOST;
      proxy_set_header X-Forwarded-For \$remote_addr;
      proxy_set_header X-Forwarded-Host $PUBLIC_HOST;
      proxy_set_header X-Forwarded-Port $PUBLIC_PORT;
      proxy_set_header X-Forwarded-Proto $PUBLIC_SCHEME;
    }

    location = /chart-api {
      proxy_pass http://$API_CONTAINER:3210/docs;
      proxy_set_header Host $PUBLIC_HOST;
      proxy_set_header X-Forwarded-For \$remote_addr;
      proxy_set_header X-Forwarded-Host $PUBLIC_HOST;
      proxy_set_header X-Forwarded-Port $PUBLIC_PORT;
      proxy_set_header X-Forwarded-Proto $PUBLIC_SCHEME;
    }

    location = /chart-api/ {
      proxy_pass http://$API_CONTAINER:3210/docs;
      proxy_set_header Host $PUBLIC_HOST;
      proxy_set_header X-Forwarded-For \$remote_addr;
      proxy_set_header X-Forwarded-Host $PUBLIC_HOST;
      proxy_set_header X-Forwarded-Port $PUBLIC_PORT;
      proxy_set_header X-Forwarded-Proto $PUBLIC_SCHEME;
    }

    location /chart-api/ {
      proxy_pass http://$API_CONTAINER:3210/;
      proxy_set_header Host $PUBLIC_HOST;
      proxy_set_header X-Forwarded-For \$remote_addr;
      proxy_set_header X-Forwarded-Host $PUBLIC_HOST;
      proxy_set_header X-Forwarded-Port $PUBLIC_PORT;
      proxy_set_header X-Forwarded-Proto $PUBLIC_SCHEME;
    }

    location = /climate-api/health {
      proxy_pass http://$API_CONTAINER:3210/health;
      proxy_set_header Host $PUBLIC_HOST;
      proxy_set_header X-Forwarded-For \$remote_addr;
      proxy_set_header X-Forwarded-Host $PUBLIC_HOST;
      proxy_set_header X-Forwarded-Port $PUBLIC_PORT;
      proxy_set_header X-Forwarded-Proto $PUBLIC_SCHEME;
    }

    location /climate/ {
      proxy_pass http://$API_CONTAINER:3210;
      proxy_read_timeout 30s;
      proxy_set_header Host $PUBLIC_HOST;
      proxy_set_header X-Forwarded-For \$remote_addr;
      proxy_set_header X-Forwarded-Host $PUBLIC_HOST;
      proxy_set_header X-Forwarded-Port $PUBLIC_PORT;
      proxy_set_header X-Forwarded-Proto $PUBLIC_SCHEME;
    }

    location / {
      proxy_pass http://$WEB_CONTAINER:3100;
      proxy_http_version 1.1;
      proxy_set_header Host $PUBLIC_HOST;
      proxy_set_header X-Forwarded-For \$remote_addr;
      proxy_set_header X-Forwarded-Host $PUBLIC_HOST;
      proxy_set_header X-Forwarded-Port $PUBLIC_PORT;
      proxy_set_header X-Forwarded-Proto $PUBLIC_SCHEME;
      proxy_set_header Upgrade \$http_upgrade;
      proxy_set_header Connection "upgrade";
    }
  }
}
EOF
chmod 600 "$PROXY_CONFIG_FILE"

echo "Building CHART images before restarting live containers..."
docker build \
  --build-arg "CHART_BUILD_ID=$(git -C "$APP_DIR" rev-parse HEAD)" \
  -f "$APP_DIR/web/Dockerfile" \
  -t "$WEB_IMAGE" \
  "$APP_DIR"
docker build -f "$APP_DIR/backend/Dockerfile" -t "$PYTHON_IMAGE" "$APP_DIR"
if [ -n "$LBW_ENABLED" ]; then
  docker build \
    -f "$APP_DIR/pipelines/models/Dockerfile" \
    -t "$LBW_IMAGE" \
    "$APP_DIR/pipelines/models"
fi

docker network create "$NETWORK" >/dev/null 2>&1 || true

docker rm -f \
  "$PROXY_CONTAINER" \
  "$WEB_CONTAINER" \
  "$API_CONTAINER" \
  "$DAGSTER_WEBSERVER_CONTAINER" \
  "$DAGSTER_DAEMON_CONTAINER" \
  "$LBW_CONTAINER" \
  "$KEYCLOAK_CONTAINER" \
  "$DB_CONTAINER" >/dev/null 2>&1 || true
docker rm -f chart-new-design chart-climate-api >/dev/null 2>&1 || true

docker run -d \
  --name "$DB_CONTAINER" \
  --network "$NETWORK" \
  --restart unless-stopped \
  -e POSTGRES_DB="$DB_NAME" \
  -e POSTGRES_USER="$DB_USER" \
  -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  -v chart-postgres-data:/var/lib/postgresql/data \
  postgis/postgis:16-3.5 >/dev/null

wait_for_command "Postgres" \
  docker exec "$DB_CONTAINER" pg_isready -U "$DB_USER" -d "$DB_NAME"

if ! docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d postgres -Atc \
  "SELECT 1 FROM pg_database WHERE datname = '$DAGSTER_DB_NAME'" | grep -qx 1; then
  docker exec "$DB_CONTAINER" createdb -U "$DB_USER" "$DAGSTER_DB_NAME"
fi

if docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d postgres -Atc \
  "SELECT 1 FROM pg_roles WHERE rolname = '$KEYCLOAK_DB_USER'" | grep -qx 1; then
  docker exec "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d postgres \
    -c "ALTER ROLE $KEYCLOAK_DB_USER WITH LOGIN PASSWORD '$KEYCLOAK_DB_PASSWORD'" \
    >/dev/null
else
  docker exec "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d postgres \
    -c "CREATE ROLE $KEYCLOAK_DB_USER WITH LOGIN PASSWORD '$KEYCLOAK_DB_PASSWORD'" \
    >/dev/null
fi

if ! docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d postgres -Atc \
  "SELECT 1 FROM pg_database WHERE datname = '$KEYCLOAK_DB_NAME'" | grep -qx 1; then
  docker exec "$DB_CONTAINER" createdb -U "$DB_USER" -O "$KEYCLOAK_DB_USER" \
    "$KEYCLOAK_DB_NAME"
fi

migrate_legacy_keycloak_database
docker rm -f "$LEGACY_KEYCLOAK_DB_CONTAINER" >/dev/null 2>&1 || true

# The stock image has not run kc.sh build, so let Keycloak build on first start.
docker run -d \
  --name "$KEYCLOAK_CONTAINER" \
  --network "$NETWORK" \
  --restart unless-stopped \
  -p 127.0.0.1:8080:8080 \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin \
  -e KC_BOOTSTRAP_ADMIN_PASSWORD="$KEYCLOAK_ADMIN_PASSWORD" \
  -e KC_DB=postgres \
  -e KC_DB_URL="jdbc:postgresql://$DB_CONTAINER:5432/$KEYCLOAK_DB_NAME" \
  -e KC_DB_USERNAME="$KEYCLOAK_DB_USER" \
  -e KC_DB_PASSWORD="$KEYCLOAK_DB_PASSWORD" \
  -e KC_HTTP_ENABLED=true \
  -e KC_HTTP_RELATIVE_PATH=/identity \
  -e KC_HOSTNAME="$PUBLIC_ORIGIN/identity" \
  -e KC_HOSTNAME_STRICT=true \
  -e KC_PROXY_HEADERS=xforwarded \
  -v "$APP_DIR/infra/keycloak/chart-realm.json:/opt/keycloak/data/import/chart-realm.json:ro" \
  -v "$APP_DIR/infra/keycloak/themes/chart:/opt/keycloak/themes/chart:ro" \
  quay.io/keycloak/keycloak:26.6.1 \
  start --import-realm >/dev/null

wait_for_command "Keycloak" curl -fsS "http://127.0.0.1:8080/identity/realms/chart"

docker run --rm \
  --network "$NETWORK" \
  -e KEYCLOAK_ADMIN_URL="http://$KEYCLOAK_CONTAINER:8080/identity" \
  -e KEYCLOAK_ADMIN_USERNAME=admin \
  -e KEYCLOAK_ADMIN_PASSWORD="$KEYCLOAK_ADMIN_PASSWORD" \
  -e KEYCLOAK_REALM=chart \
  -e KEYCLOAK_REALM_FILE=/keycloak/chart-realm.json \
  -e CHART_WEB_ORIGIN="$PUBLIC_ORIGIN" \
  -e KEYCLOAK_GOOGLE_CLIENT_ID="${KEYCLOAK_GOOGLE_CLIENT_ID:-}" \
  -e KEYCLOAK_GOOGLE_CLIENT_SECRET="${KEYCLOAK_GOOGLE_CLIENT_SECRET:-}" \
  -e KEYCLOAK_GOOGLE_HOSTED_DOMAIN="${KEYCLOAK_GOOGLE_HOSTED_DOMAIN:-}" \
  -v "$APP_DIR/infra/keycloak:/keycloak:ro" \
  node:22-alpine node /keycloak/sync-realm.js

BACKUP_DIR="${BACKUP_DIR:-$ENV_DIR/backups}"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/chart-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$DB_CONTAINER" \
  pg_dump -U "$DB_USER" -d "$DB_NAME" --format=custom >"$BACKUP_FILE"
chmod 600 "$BACKUP_FILE"
find "$BACKUP_DIR" -type f -name 'chart-*.dump' -mtime +14 -delete
echo "Created pre-migration database backup at $BACKUP_FILE"

docker run --rm \
  --network "$NETWORK" \
  --env-file "$ENV_FILE" \
  -e DATABASE_URL="$PYTHON_DATABASE_URL" \
  "$PYTHON_IMAGE" scripts/migrate.sh

BOOTSTRAP_MODEL_ARG=""
if [ -n "$LBW_ENABLED" ]; then
  BOOTSTRAP_MODEL_ARG="--activate-model"
fi
docker run --rm \
  --network "$NETWORK" \
  --env-file "$ENV_FILE" \
  -e DATABASE_URL="$PYTHON_DATABASE_URL" \
  "$PYTHON_IMAGE" chart-bootstrap-mp \
    --source-manifest /app/pipelines/boundaries/manifests/mp_model_areas_v1.json \
    --crosswalk /app/pipelines/boundaries/data/mp_district_division_crosswalk.csv \
    --model-release /app/pipelines/models/lbw/model-release.mp.compact.review.json \
    $BOOTSTRAP_MODEL_ARG

docker run --rm \
  --network "$NETWORK" \
  --env-file "$DAGSTER_ENV_FILE" \
  -e DATABASE_URL="$PYTHON_DATABASE_URL" \
  "$PYTHON_IMAGE" dagster instance migrate

docker run -d \
  --name "$API_CONTAINER" \
  --network "$NETWORK" \
  --restart unless-stopped \
  --env-file "$ENV_FILE" \
  -e DATABASE_URL="$PYTHON_DATABASE_URL" \
  -e HOST=0.0.0.0 \
  -e PORT=3210 \
  -p 127.0.0.1:3210:3210 \
  -v chart-lbw-model:/models \
  "$PYTHON_IMAGE" >/dev/null

wait_for_command "CHART API" curl -fsS "http://127.0.0.1:3210/ready"

docker run -d \
  --name "$WEB_CONTAINER" \
  --network "$NETWORK" \
  --restart unless-stopped \
  --env-file "$WEB_ENV_FILE" \
  -e HOSTNAME=0.0.0.0 \
  -e PORT=3100 \
  "$WEB_IMAGE" >/dev/null

if [ -n "$LBW_ENABLED" ]; then
  # The shared model volume `chart-lbw-model:/models` is mounted on both
  # the Python API and the LBW container so that Python's
  # warm_model_release can hash the RDS files locally and then POST a
  # local_path to R that both processes can resolve. Sync every artifact
  # every manifest under pipelines/models/**/model-release.*.json
  # references from S3 into the volume before the R container starts —
  # otherwise the first `/models/load` call fires MODEL_RELEASE_FILE_MISSING.
  #
  # The sync is idempotent (aws s3 sync only copies changed files by
  # SHA/mtime), and we scope it via --exclude/--include so unrelated
  # bucket objects (archive/, old rewrites) don't get pulled onto the
  # host. New releases only need: (1) manifest committed to the repo,
  # (2) rds uploaded to base_uri, (3) redeploy — no infra edit.
  MODEL_BUCKET="${MODEL_BUCKET:-chart-predictive-models}"
  MODEL_REGION="${AWS_REGION:-eu-west-2}"
  # Ensure the named volume exists so the sync + downstream containers
  # can both mount it. `docker volume create` is idempotent.
  docker volume create chart-lbw-model >/dev/null
  echo "Syncing model artifacts from s3://$MODEL_BUCKET → chart-lbw-model:/models ..."
  # Read every manifest and construct include filters for each declared
  # (base_uri, filename) pair. This scopes the sync to files the app
  # actually loads, so stray bucket objects (archive, WIP releases) are
  # ignored.
  include_flags=()
  while IFS= read -r manifest; do
    while IFS=$'\t' read -r base_uri filename; do
      [ -z "$filename" ] && continue
      # Strip the s3://<bucket>/ prefix so --include is a plain key
      # pattern rooted at the bucket. Example base_uri:
      #   s3://chart-predictive-models/india/mp/lbw/1.0.1-compact-review
      key="${base_uri#s3://$MODEL_BUCKET/}/$filename"
      include_flags+=("--include" "$key")
    done < <(python3 - "$manifest" <<'PY'
import json, sys
manifest = json.load(open(sys.argv[1]))
base = manifest["base_uri"].rstrip("/")
for entry in manifest.get("model_files", []):
    print(f"{base}\t{entry['filename']}")
PY
)
  done < <(find "$APP_DIR/pipelines/models" -name "model-release*.json" -type f)

  if [ ${#include_flags[@]} -gt 0 ]; then
    # Run the sync from inside a throwaway aws-cli container that
    # mounts the named volume — no host-side chmod/sudo required. Two
    # credential paths supported:
    #
    #   1. EC2 instance profile via IMDS: reached with --network host so
    #      the container talks to 169.254.169.254 through the host's
    #      network stack. The default docker bridge doesn't forward IMDS
    #      (IMDSv2's HttpPutResponseHopLimit=1 blocks it), so bridged
    #      containers hit "Unable to locate credentials"; --network host
    #      sidesteps the whole hop-limit question.
    #
    #   2. Explicit env / mounted creds: on a workstation without IMDS,
    #      set AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / optionally
    #      AWS_SESSION_TOKEN and they flow through; or mount ~/.aws.
    #
    docker_cred_args=(--network host)
    if [ -n "${AWS_ACCESS_KEY_ID:-}" ]; then
      docker_cred_args+=(-e AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID")
      docker_cred_args+=(-e AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-}")
      [ -n "${AWS_SESSION_TOKEN:-}" ] && \
        docker_cred_args+=(-e AWS_SESSION_TOKEN="$AWS_SESSION_TOKEN")
    elif [ -d "$HOME/.aws" ]; then
      docker_cred_args+=(-v "$HOME/.aws:/root/.aws:ro")
    fi
    docker run --rm \
      "${docker_cred_args[@]}" \
      -v chart-lbw-model:/models \
      -e AWS_DEFAULT_REGION="$MODEL_REGION" \
      public.ecr.aws/aws-cli/aws-cli:latest \
      s3 sync "s3://$MODEL_BUCKET/" /models/ \
      --exclude "*" \
      "${include_flags[@]}"
  else
    echo "WARN: no model-release manifests found under pipelines/models — skipping S3 sync"
  fi

  docker run -d \
    --name "$LBW_CONTAINER" \
    --network "$NETWORK" \
    --restart unless-stopped \
    -e MODEL_CONTROL_TOKEN="$MODEL_CONTROL_TOKEN" \
    -e MODEL_CACHE_DIR=/models \
    -v chart-lbw-model:/models \
    "$LBW_IMAGE" >/dev/null

  wait_for_command "LBW inference" \
    docker exec "$LBW_CONTAINER" curl -fsS "http://127.0.0.1:8000/health"
fi

docker run -d \
  --name "$DAGSTER_WEBSERVER_CONTAINER" \
  --network "$NETWORK" \
  --restart unless-stopped \
  --env-file "$DAGSTER_ENV_FILE" \
  --env-file "$PREDICTION_ENV_FILE" \
  -e DATABASE_URL="$PYTHON_DATABASE_URL" \
  -p 127.0.0.1:3000:3000 \
  -v chart-dagster-storage:/opt/dagster/storage \
  -v chart-climate-data:/opt/chart/data/climate \
  "$PYTHON_IMAGE" \
  dagster-webserver -h 0.0.0.0 -p 3000 -m chart_pipeline.definitions >/dev/null

wait_for_command "Dagster webserver" curl -fsS "http://127.0.0.1:3000/server_info"

docker run -d \
  --name "$DAGSTER_DAEMON_CONTAINER" \
  --network "$NETWORK" \
  --restart unless-stopped \
  --env-file "$DAGSTER_ENV_FILE" \
  --env-file "$PREDICTION_ENV_FILE" \
  -e DATABASE_URL="$PYTHON_DATABASE_URL" \
  -v chart-dagster-storage:/opt/dagster/storage \
  -v chart-climate-data:/opt/chart/data/climate \
  "$PYTHON_IMAGE" \
  dagster-daemon run -m chart_pipeline.definitions >/dev/null

wait_for_command "Dagster daemon" \
  docker exec "$DAGSTER_DAEMON_CONTAINER" dagster-daemon liveness-check

docker run -d \
  --name "$PROXY_CONTAINER" \
  --network "$NETWORK" \
  --restart unless-stopped \
  "${PROXY_PORT_ARGS[@]}" \
  "${PROXY_TLS_ARGS[@]}" \
  -v "$PROXY_CONFIG_FILE:/etc/nginx/nginx.conf:ro" \
  nginx:1.27-alpine >/dev/null

if [ "$PUBLIC_SCHEME" = "https" ] && [ "$TLS_TERMINATED_UPSTREAM" != "1" ]; then
  LOCAL_PROXY_ORIGIN="https://127.0.0.1"
  LOCAL_PROXY_CURL_ARGS=(-kfsS)
else
  LOCAL_PROXY_ORIGIN="http://127.0.0.1"
  LOCAL_PROXY_CURL_ARGS=(-fsS)
fi
wait_for_command "CHART web through proxy" \
  curl "${LOCAL_PROXY_CURL_ARGS[@]}" -H "Host: $PUBLIC_HOST" \
  "$LOCAL_PROXY_ORIGIN/api/build"
wait_for_command "CHART API through proxy" \
  curl "${LOCAL_PROXY_CURL_ARGS[@]}" -H "Host: $PUBLIC_HOST" \
  "$LOCAL_PROXY_ORIGIN/chart-api/ready"
wait_for_command "CHART climate API through proxy" \
  curl "${LOCAL_PROXY_CURL_ARGS[@]}" -H "Host: $PUBLIC_HOST" \
  "$LOCAL_PROXY_ORIGIN/climate-api/health"
wait_for_command "Keycloak through proxy" \
  curl "${LOCAL_PROXY_CURL_ARGS[@]}" -H "Host: $PUBLIC_HOST" \
  "$LOCAL_PROXY_ORIGIN/identity/realms/chart"
wait_for_command "Keycloak authorization through proxy" \
  curl "${LOCAL_PROXY_CURL_ARGS[@]}" -H "Host: $PUBLIC_HOST" --get \
  --data-urlencode "client_id=chart-web" \
  --data-urlencode "redirect_uri=$PUBLIC_ORIGIN/auth/callback" \
  --data-urlencode "response_type=code" \
  --data-urlencode "scope=openid" \
  --data-urlencode "state=deploy-check" \
  --data-urlencode "code_challenge=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
  --data-urlencode "code_challenge_method=S256" \
  "$LOCAL_PROXY_ORIGIN/identity/realms/chart/protocol/openid-connect/auth"
echo "CHART is running at $PUBLIC_ORIGIN"
echo "CHART API is running at $PUBLIC_ORIGIN/chart-api"
echo "CHART planning API is also available at $PUBLIC_ORIGIN/climate"
echo "Dagster UI is private at http://127.0.0.1:3000 (use an SSH tunnel)."
echo "CHART sign-in is running at $PUBLIC_ORIGIN/identity"
echo "LBW inference is private on the CHART container network."
