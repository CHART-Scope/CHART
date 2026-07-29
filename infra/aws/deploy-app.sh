#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/chart}"
ENV_DIR="${ENV_DIR:-/opt/chart-env}"
ENV_FILE="${ENV_FILE:-$ENV_DIR/chart.env}"
PREDICTION_ENV_FILE="${PREDICTION_ENV_FILE:-$ENV_DIR/prediction-worker.env}"
NETWORK="${NETWORK:-chart-net}"

DB_CONTAINER="${DB_CONTAINER:-chart-postgres}"
LEGACY_KEYCLOAK_DB_CONTAINER="${LEGACY_KEYCLOAK_DB_CONTAINER:-chart-keycloak-postgres}"
KEYCLOAK_CONTAINER="${KEYCLOAK_CONTAINER:-chart-keycloak}"
API_CONTAINER="${API_CONTAINER:-chart-api}"
WEB_CONTAINER="${WEB_CONTAINER:-chart-web}"
LBW_CONTAINER="${LBW_CONTAINER:-chart-lbw}"
CLIMATE_API_CONTAINER="${CLIMATE_API_CONTAINER:-chart-climate-api}"
DAGSTER_WEBSERVER_CONTAINER="${DAGSTER_WEBSERVER_CONTAINER:-chart-dagster-webserver}"
DAGSTER_DAEMON_CONTAINER="${DAGSTER_DAEMON_CONTAINER:-chart-dagster-daemon}"
PROXY_CONTAINER="${PROXY_CONTAINER:-chart-proxy}"

DB_NAME="${DB_NAME:-chart}"
DAGSTER_DB_NAME="chart_dagster"
KEYCLOAK_DB_NAME="${KEYCLOAK_DB_NAME:-chart_keycloak}"
KEYCLOAK_DB_USER="chart_keycloak"
DB_USER="${DB_USER:-chart}"
API_IMAGE="${API_IMAGE:-chart-api:latest}"
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

detect_public_origin() {
  if [ -n "${PUBLIC_ORIGIN:-}" ]; then
    printf "%s" "${PUBLIC_ORIGIN%/}"
    return
  fi

  local public_host="${PUBLIC_HOST:-}"
  if [ -z "$public_host" ]; then
    public_host="$(curl -fsS https://checkip.amazonaws.com 2>/dev/null | tr -d "[:space:]")"
  fi
  printf "%s://%s" "${PUBLIC_SCHEME:-http}" "$public_host"
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

PUBLIC_ORIGIN="$(detect_public_origin)"

if [ -z "$PUBLIC_ORIGIN" ]; then
  echo "Set PUBLIC_ORIGIN to the browser-facing origin, including https://." >&2
  exit 1
fi

if [[ ! "$PUBLIC_ORIGIN" =~ ^https?://[a-zA-Z0-9.-]+(:[0-9]{1,5})?$ ]]; then
  echo "Set PUBLIC_ORIGIN to an http or https origin without a path." >&2
  exit 1
fi

PUBLIC_HOST="${PUBLIC_ORIGIN#*://}"

mkdir -p "$ENV_DIR"

DEPLOY_CDSAPI_KEY="${CDSAPI_KEY:-}"
DEPLOY_CDSAPI_URL="${CDSAPI_URL:-}"
DEPLOY_LBW_MODEL_DIVISION_S3_URI="${LBW_MODEL_DIVISION_S3_URI:-}"
DEPLOY_LBW_MODEL_STATE_S3_URI="${LBW_MODEL_STATE_S3_URI:-}"
DEPLOY_KEYCLOAK_GOOGLE_CLIENT_ID="${KEYCLOAK_GOOGLE_CLIENT_ID:-}"
DEPLOY_KEYCLOAK_GOOGLE_CLIENT_SECRET="${KEYCLOAK_GOOGLE_CLIENT_SECRET:-}"
DEPLOY_KEYCLOAK_GOOGLE_HOSTED_DOMAIN="${KEYCLOAK_GOOGLE_HOSTED_DOMAIN:-}"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck source=/dev/null
  . "$ENV_FILE"
  set +a
fi

if [ -f "$PREDICTION_ENV_FILE" ]; then
  set -a
  # shellcheck source=/dev/null
  . "$PREDICTION_ENV_FILE"
  set +a
fi

POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(random_secret)}"
KEYCLOAK_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-$(random_secret)}"
KEYCLOAK_DB_PASSWORD="$(random_secret)"
CDSAPI_KEY="${DEPLOY_CDSAPI_KEY:-${CDSAPI_KEY:-}}"
CDSAPI_URL="${DEPLOY_CDSAPI_URL:-${CDSAPI_URL:-https://cds.climate.copernicus.eu/api}}"
LBW_MODEL_DIVISION_S3_URI="${DEPLOY_LBW_MODEL_DIVISION_S3_URI:-${LBW_MODEL_DIVISION_S3_URI:-${LBW_MODEL_S3_URI:-}}}"
LBW_MODEL_STATE_S3_URI="${DEPLOY_LBW_MODEL_STATE_S3_URI:-${LBW_MODEL_STATE_S3_URI:-}}"
KEYCLOAK_GOOGLE_CLIENT_ID="${DEPLOY_KEYCLOAK_GOOGLE_CLIENT_ID:-${KEYCLOAK_GOOGLE_CLIENT_ID:-}}"
KEYCLOAK_GOOGLE_CLIENT_SECRET="${DEPLOY_KEYCLOAK_GOOGLE_CLIENT_SECRET:-${KEYCLOAK_GOOGLE_CLIENT_SECRET:-}}"
KEYCLOAK_GOOGLE_HOSTED_DOMAIN="${DEPLOY_KEYCLOAK_GOOGLE_HOSTED_DOMAIN:-${KEYCLOAK_GOOGLE_HOSTED_DOMAIN:-scopeimpact.fi}}"

LBW_ENABLED=""
LBW_SERVICE_URL=""
if [ -n "$LBW_MODEL_DIVISION_S3_URI" ] && [ -n "$LBW_MODEL_STATE_S3_URI" ]; then
  LBW_ENABLED=1
  LBW_SERVICE_URL="http://$LBW_CONTAINER:8000"
elif [ -n "$LBW_MODEL_DIVISION_S3_URI" ] || [ -n "$LBW_MODEL_STATE_S3_URI" ]; then
  echo "LBW inference disabled: configure both model S3 URIs together." >&2
fi

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
CHART_API_INTERNAL_URL=http://$API_CONTAINER:3200
CHART_PYTHON_API_INTERNAL_URL=http://$CLIMATE_API_CONTAINER:3210
CHART_CORS_ORIGINS=$PUBLIC_ORIGIN
CHART_WEB_ORIGIN=$PUBLIC_ORIGIN
EOF

chmod 600 "$ENV_FILE"

cat >"$PREDICTION_ENV_FILE" <<EOF
CDSAPI_URL=$CDSAPI_URL
CDSAPI_KEY=$CDSAPI_KEY
LBW_SERVICE_URL=$LBW_SERVICE_URL
EOF

chmod 600 "$PREDICTION_ENV_FILE"

LBW_NGINX_LOCATION=""
if [ -n "$LBW_ENABLED" ]; then
  LBW_NGINX_LOCATION="$(cat <<EOF
    location = /lbw {
      return 302 /lbw/ui/;
    }

    location /lbw/ {
      proxy_pass http://$LBW_CONTAINER:8000/;
      proxy_read_timeout 120s;
      proxy_set_header Host \$host;
      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Host \$host;
      proxy_set_header X-Forwarded-Port \$server_port;
      proxy_set_header X-Forwarded-Proto \$scheme;
    }
EOF
)"
fi

cat >"$PROXY_CONFIG_FILE" <<EOF
events {}

http {
  map \$http_x_forwarded_proto \$chart_forwarded_proto {
    default \$http_x_forwarded_proto;
    "" \$scheme;
  }

  map \$http_x_forwarded_host \$chart_forwarded_host {
    default \$http_x_forwarded_host;
    "" \$host;
  }

  map \$http_x_forwarded_port \$chart_forwarded_port {
    default \$http_x_forwarded_port;
    "" \$server_port;
  }

  server {
    listen 80;
    client_max_body_size 25m;

    location = /identity {
      return 302 /identity/;
    }

    location /identity/ {
      proxy_pass http://$KEYCLOAK_CONTAINER:8080;
      proxy_set_header Host \$host;
      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Host \$chart_forwarded_host;
      proxy_set_header X-Forwarded-Port \$chart_forwarded_port;
      proxy_set_header X-Forwarded-Proto \$chart_forwarded_proto;
    }

    location = /chart-api {
      proxy_pass http://$API_CONTAINER:3200/api;
      proxy_set_header Host \$host;
      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Host \$host;
      proxy_set_header X-Forwarded-Port \$server_port;
      proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location = /chart-api/ {
      proxy_pass http://$API_CONTAINER:3200/api;
      proxy_set_header Host \$host;
      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Host \$host;
      proxy_set_header X-Forwarded-Port \$server_port;
      proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /chart-api/ {
      proxy_pass http://$API_CONTAINER:3200/;
      proxy_set_header Host \$host;
      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Host \$host;
      proxy_set_header X-Forwarded-Port \$server_port;
      proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /chart-api/auth/ {
      proxy_pass http://$CLIMATE_API_CONTAINER:3210/auth/;
      proxy_set_header Host \$host;
      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Host \$host;
      proxy_set_header X-Forwarded-Port \$server_port;
      proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location = /climate-api/health {
      proxy_pass http://$CLIMATE_API_CONTAINER:3210/health;
      proxy_set_header Host \$host;
      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Host \$host;
      proxy_set_header X-Forwarded-Port \$server_port;
      proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /climate/ {
      proxy_pass http://$CLIMATE_API_CONTAINER:3210;
      proxy_read_timeout 30s;
      proxy_set_header Host \$host;
      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Host \$host;
      proxy_set_header X-Forwarded-Port \$server_port;
      proxy_set_header X-Forwarded-Proto \$scheme;
    }

$LBW_NGINX_LOCATION

    location / {
      proxy_pass http://$WEB_CONTAINER:3100;
      proxy_http_version 1.1;
      proxy_set_header Host \$host;
      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Host \$host;
      proxy_set_header X-Forwarded-Port \$server_port;
      proxy_set_header X-Forwarded-Proto \$scheme;
      proxy_set_header Upgrade \$http_upgrade;
      proxy_set_header Connection "upgrade";
    }
  }
}
EOF
chmod 600 "$PROXY_CONFIG_FILE"

echo "Building CHART images before restarting live containers..."
docker build -f "$APP_DIR/api/Dockerfile" -t "$API_IMAGE" "$APP_DIR"
docker build -f "$APP_DIR/web/Dockerfile" -t "$WEB_IMAGE" "$APP_DIR"
docker build -f "$APP_DIR/backend/Dockerfile" -t "$PYTHON_IMAGE" "$APP_DIR"
if [ -n "$LBW_ENABLED" ]; then
  docker build \
    -f "$APP_DIR/pipelines/LBW_demo/Dockerfile" \
    -t "$LBW_IMAGE" \
    "$APP_DIR/pipelines/LBW_demo"
fi

docker network create "$NETWORK" >/dev/null 2>&1 || true

docker rm -f \
  "$PROXY_CONTAINER" \
  "$WEB_CONTAINER" \
  "$API_CONTAINER" \
  "$CLIMATE_API_CONTAINER" \
  "$DAGSTER_WEBSERVER_CONTAINER" \
  "$DAGSTER_DAEMON_CONTAINER" \
  "$LBW_CONTAINER" \
  "$KEYCLOAK_CONTAINER" \
  "$DB_CONTAINER" >/dev/null 2>&1 || true

docker run -d \
  --name "$DB_CONTAINER" \
  --network "$NETWORK" \
  --restart unless-stopped \
  -e POSTGRES_DB="$DB_NAME" \
  -e POSTGRES_USER="$DB_USER" \
  -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  -v chart-postgres-data:/var/lib/postgresql/data \
  postgres:16-alpine >/dev/null

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
  start-dev --import-realm >/dev/null

wait_for_command "Keycloak" curl -fsS "http://127.0.0.1:8080/identity/realms/chart"

docker exec "$KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080/identity \
  --realm master \
  --user admin \
  --password "$KEYCLOAK_ADMIN_PASSWORD" >/dev/null

docker exec "$KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh update realms/chart \
  -s loginTheme=chart \
  -s sslRequired=none >/dev/null

docker run --rm \
  --network "$NETWORK" \
  -e KEYCLOAK_ADMIN_URL="http://$KEYCLOAK_CONTAINER:8080/identity" \
  -e KEYCLOAK_ADMIN_USERNAME=admin \
  -e KEYCLOAK_ADMIN_PASSWORD="$KEYCLOAK_ADMIN_PASSWORD" \
  -e KEYCLOAK_REALM=chart \
  -e KEYCLOAK_REALM_FILE=/keycloak/chart-realm.json \
  -e CHART_WEB_ORIGIN="$PUBLIC_ORIGIN" \
  -e KEYCLOAK_GOOGLE_CLIENT_ID="$KEYCLOAK_GOOGLE_CLIENT_ID" \
  -e KEYCLOAK_GOOGLE_CLIENT_SECRET="$KEYCLOAK_GOOGLE_CLIENT_SECRET" \
  -e KEYCLOAK_GOOGLE_HOSTED_DOMAIN="$KEYCLOAK_GOOGLE_HOSTED_DOMAIN" \
  -v "$APP_DIR/infra/keycloak:/keycloak:ro" \
  node:22-alpine node /keycloak/sync-realm.js

docker run --rm \
  --network "$NETWORK" \
  --env-file "$ENV_FILE" \
  "$API_IMAGE" npm run db:migrate:api

docker run --rm \
  --network "$NETWORK" \
  --env-file "$ENV_FILE" \
  "$API_IMAGE" npm run db:seed:api

docker run --rm \
  --network "$NETWORK" \
  --env-file "$ENV_FILE" \
  -e DATABASE_URL="$PYTHON_DATABASE_URL" \
  "$PYTHON_IMAGE" alembic upgrade head

docker run --rm \
  --network "$NETWORK" \
  --env-file "$ENV_FILE" \
  "$PYTHON_IMAGE" dagster instance migrate

docker run -d \
  --name "$API_CONTAINER" \
  --network "$NETWORK" \
  --restart unless-stopped \
  --env-file "$ENV_FILE" \
  -e HOST=0.0.0.0 \
  -e PORT=3200 \
  -p 127.0.0.1:3200:3200 \
  "$API_IMAGE" >/dev/null

wait_for_command "CHART API" curl -fsS "http://127.0.0.1:3200/health"

docker run -d \
  --name "$CLIMATE_API_CONTAINER" \
  --network "$NETWORK" \
  --restart unless-stopped \
  --env-file "$ENV_FILE" \
  -e DATABASE_URL="$PYTHON_DATABASE_URL" \
  -e HOST=0.0.0.0 \
  -e PORT=3210 \
  -p 127.0.0.1:3210:3210 \
  "$PYTHON_IMAGE" >/dev/null

wait_for_command "CHART climate API" curl -fsS "http://127.0.0.1:3210/health"

docker run -d \
  --name "$WEB_CONTAINER" \
  --network "$NETWORK" \
  --restart unless-stopped \
  --env-file "$ENV_FILE" \
  -e HOSTNAME=0.0.0.0 \
  -e PORT=3100 \
  "$WEB_IMAGE" >/dev/null

if [ -n "$LBW_ENABLED" ]; then
  docker run -d \
    --name "$LBW_CONTAINER" \
    --network "$NETWORK" \
    --restart unless-stopped \
    -e LBW_MODEL_DIVISION_S3_URI="$LBW_MODEL_DIVISION_S3_URI" \
    -e LBW_MODEL_STATE_S3_URI="$LBW_MODEL_STATE_S3_URI" \
    -v chart-lbw-model:/models \
    "$LBW_IMAGE" >/dev/null

  wait_for_command "LBW inference" \
    docker exec "$LBW_CONTAINER" curl -fsS "http://127.0.0.1:8000/health"
fi

docker run -d \
  --name "$DAGSTER_WEBSERVER_CONTAINER" \
  --network "$NETWORK" \
  --restart unless-stopped \
  --env-file "$ENV_FILE" \
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
  --env-file "$ENV_FILE" \
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
  -p 80:80 \
  -v "$PROXY_CONFIG_FILE:/etc/nginx/nginx.conf:ro" \
  nginx:1.27-alpine >/dev/null

wait_for_command "CHART web" curl -fsS "http://127.0.0.1/"
wait_for_command "CHART API through proxy" curl -fsS "http://127.0.0.1/chart-api/health"
wait_for_command "CHART climate API through proxy" curl -fsS "http://127.0.0.1/climate-api/health"
wait_for_command "Keycloak through proxy" curl -fsS "http://127.0.0.1/identity/realms/chart"
if [ -n "$LBW_ENABLED" ]; then
  wait_for_command "LBW inference through proxy" curl -fsS "http://127.0.0.1/lbw/health"
fi

echo "CHART is running at $PUBLIC_ORIGIN"
echo "CHART API is running at $PUBLIC_ORIGIN/chart-api"
echo "CHART climate API is running at $PUBLIC_ORIGIN/climate"
echo "Dagster UI is private at http://127.0.0.1:3000 (use an SSH tunnel)."
echo "CHART sign-in is running at $PUBLIC_ORIGIN/identity"
if [ -n "$LBW_ENABLED" ]; then
  echo "LBW inference is running at $PUBLIC_ORIGIN/lbw/ui/"
else
  echo "LBW inference is disabled until both model S3 URIs are configured."
fi
