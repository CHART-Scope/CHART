# CHART's Keycloak, so a deployment holds no Keycloak files of its own.
#   default target  -> chart-keycloak: email-code plugin, CHART theme and
#                      realm seed, pre-built for PostgreSQL under /identity.
#   --target config -> chart-keycloak-config: the realm sync run on each deploy.
ARG KEYCLOAK_VERSION=26.6.4

FROM quay.io/keycloak/keycloak:${KEYCLOAK_VERSION} AS build
# Build-time options; `start --optimized` then skips the rebuild at startup.
ENV KC_DB=postgres \
    KC_HTTP_RELATIVE_PATH=/identity
COPY providers/ /opt/keycloak/providers/
COPY themes/chart/ /opt/keycloak/themes/chart/
RUN /opt/keycloak/bin/kc.sh build

FROM node:22-alpine AS config
COPY sync-realm.js chart-realm.json /keycloak/
ENV KEYCLOAK_REALM_FILE=/keycloak/chart-realm.json
USER node
CMD ["node", "/keycloak/sync-realm.js"]

FROM quay.io/keycloak/keycloak:${KEYCLOAK_VERSION}
COPY --from=build /opt/keycloak/ /opt/keycloak/
COPY chart-realm.json /opt/keycloak/data/import/chart-realm.json
