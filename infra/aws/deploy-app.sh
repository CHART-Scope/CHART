#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/chart}"
ENV_DIR="${ENV_DIR:-/opt/chart-env}"
ENV_FILE="${ENV_FILE:-$ENV_DIR/chart.env}"
NETWORK="${NETWORK:-chart-net}"

DB_CONTAINER="${DB_CONTAINER:-chart-postgres}"
KEYCLOAK_CONTAINER="${KEYCLOAK_CONTAINER:-chart-keycloak}"
API_CONTAINER="${API_CONTAINER:-chart-api}"
WEB_CONTAINER="${WEB_CONTAINER:-chart-web}"
PROXY_CONTAINER="${PROXY_CONTAINER:-chart-proxy}"

DB_NAME="${DB_NAME:-chart}"
DB_USER="${DB_USER:-chart}"
API_IMAGE="${API_IMAGE:-chart-api:latest}"
WEB_IMAGE="${WEB_IMAGE:-chart-web:latest}"
PROXY_CONFIG_FILE="${PROXY_CONFIG_FILE:-$ENV_DIR/nginx.conf}"

random_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 24
    return
  fi

  date +%s%N | sha256sum | cut -c 1-48
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

PUBLIC_HOST="$(detect_public_host)"

if [ -z "$PUBLIC_HOST" ]; then
  echo "Set PUBLIC_HOST to the public host or IP used by browsers." >&2
  exit 1
fi

mkdir -p "$ENV_DIR"

if [ -f "$ENV_FILE" ]; then
  set -a
  . "$ENV_FILE"
  set +a
fi

POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(random_secret)}"
KEYCLOAK_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-$(random_secret)}"
PAYLOAD_SECRET="${PAYLOAD_SECRET:-$(random_secret)}"
CHART_FORCE_CONTENT_SEED="${CHART_FORCE_CONTENT_SEED:-false}"

cat >"$ENV_FILE" <<EOF
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
KEYCLOAK_ADMIN_PASSWORD=$KEYCLOAK_ADMIN_PASSWORD
PAYLOAD_SECRET=$PAYLOAD_SECRET
DATABASE_URL=postgres://$DB_USER:$POSTGRES_PASSWORD@$DB_CONTAINER:5432/$DB_NAME
KEYCLOAK_ISSUER_URL=http://$PUBLIC_HOST/identity/realms/chart
KEYCLOAK_CLIENT_ID=chart-api
KEYCLOAK_JWKS_URL=http://$KEYCLOAK_CONTAINER:8080/identity/realms/chart/protocol/openid-connect/certs
KEYCLOAK_CLOCK_SKEW_SECONDS=30
KEYCLOAK_SERVER_URL=http://$KEYCLOAK_CONTAINER:8080/identity
KEYCLOAK_BROWSER_URL=http://$PUBLIC_HOST/identity
KEYCLOAK_ADMIN_URL=http://$KEYCLOAK_CONTAINER:8080/identity
KEYCLOAK_ADMIN_USERNAME=admin
KEYCLOAK_REALM=chart
KEYCLOAK_WEB_CLIENT_ID=chart-web
CHART_API_INTERNAL_URL=http://$API_CONTAINER:3200
CHART_CORS_ORIGINS=http://$PUBLIC_HOST
CHART_CMS_SERVER_URL=http://$PUBLIC_HOST
CHART_WEB_ORIGIN=http://$PUBLIC_HOST
EOF

chmod 600 "$ENV_FILE"

cat >"$PROXY_CONFIG_FILE" <<EOF
events {}

http {
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
      proxy_set_header X-Forwarded-Host \$host;
      proxy_set_header X-Forwarded-Port \$server_port;
      proxy_set_header X-Forwarded-Proto \$scheme;
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

docker network create "$NETWORK" >/dev/null 2>&1 || true

docker rm -f "$PROXY_CONTAINER" "$WEB_CONTAINER" "$API_CONTAINER" "$KEYCLOAK_CONTAINER" "$DB_CONTAINER" \
  >/dev/null 2>&1 || true

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

docker run -d \
  --name "$KEYCLOAK_CONTAINER" \
  --network "$NETWORK" \
  --restart unless-stopped \
  -p 127.0.0.1:8080:8080 \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin \
  -e KC_BOOTSTRAP_ADMIN_PASSWORD="$KEYCLOAK_ADMIN_PASSWORD" \
  -e KC_DB=postgres \
  -e KC_DB_URL="jdbc:postgresql://$DB_CONTAINER:5432/$DB_NAME" \
  -e KC_DB_USERNAME="$DB_USER" \
  -e KC_DB_PASSWORD="$POSTGRES_PASSWORD" \
  -e KC_HTTP_ENABLED=true \
  -e KC_HTTP_RELATIVE_PATH=/identity \
  -e KC_HOSTNAME="http://$PUBLIC_HOST/identity" \
  -e KC_HOSTNAME_STRICT=false \
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

WEB_CLIENT_UUID="$(
  docker exec "$KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh get clients \
    -r chart \
    -q clientId=chart-web \
    --fields id \
    --format csv \
    --noquotes | tail -n 1
)"

docker exec "$KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh update \
  "clients/$WEB_CLIENT_UUID" \
  -r chart \
  -s "redirectUris=[\"http://$PUBLIC_HOST/*\",\"http://localhost:3100/*\",\"http://127.0.0.1:3100/*\"]" \
  -s "attributes={\"post.logout.redirect.uris\":\"http://$PUBLIC_HOST##http://$PUBLIC_HOST/*##http://localhost:3100##http://localhost:3100/*##http://127.0.0.1:3100##http://127.0.0.1:3100/*\"}" \
  -s 'webOrigins=["+"]' >/dev/null

docker build -f "$APP_DIR/api/Dockerfile" -t "$API_IMAGE" "$APP_DIR"

docker run --rm \
  --network "$NETWORK" \
  -e KEYCLOAK_ADMIN_URL="http://$KEYCLOAK_CONTAINER:8080/identity" \
  -e KEYCLOAK_ADMIN_USERNAME=admin \
  -e KEYCLOAK_ADMIN_PASSWORD="$KEYCLOAK_ADMIN_PASSWORD" \
  -e KEYCLOAK_REALM=chart \
  -e KEYCLOAK_REALM_FILE=/keycloak/chart-realm.json \
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

docker build -f "$APP_DIR/web/Dockerfile" -t "$WEB_IMAGE" "$APP_DIR"

docker run --rm \
  --network "$NETWORK" \
  --env-file "$ENV_FILE" \
  -e NODE_ENV=development \
  -e CHART_FORCE_CONTENT_SEED="$CHART_FORCE_CONTENT_SEED" \
  -v chart-payload-uploads:/repo/web/public/uploads \
  "$WEB_IMAGE" npm run seed:web

docker run -d \
  --name "$WEB_CONTAINER" \
  --network "$NETWORK" \
  --restart unless-stopped \
  --env-file "$ENV_FILE" \
  -e HOSTNAME=0.0.0.0 \
  -e PORT=3100 \
  -v chart-payload-uploads:/repo/web/public/uploads \
  "$WEB_IMAGE" >/dev/null

docker run -d \
  --name "$PROXY_CONTAINER" \
  --network "$NETWORK" \
  --restart unless-stopped \
  -p 80:80 \
  -v "$PROXY_CONFIG_FILE:/etc/nginx/nginx.conf:ro" \
  nginx:1.27-alpine >/dev/null

wait_for_command "CHART web" curl -fsS "http://127.0.0.1/"
wait_for_command "CHART API through proxy" curl -fsS "http://127.0.0.1/chart-api/health"
wait_for_command "Keycloak through proxy" curl -fsS "http://127.0.0.1/identity/realms/chart"

echo "CHART is running at http://$PUBLIC_HOST"
echo "CHART API is running at http://$PUBLIC_HOST/chart-api"
echo "CHART sign-in is running at http://$PUBLIC_HOST/identity"
