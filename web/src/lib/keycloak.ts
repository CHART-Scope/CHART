import type { NextRequest } from "next/server";

import { getRequestOrigin, isLocalOrigin, trimTrailingSlash } from "./httpRequest";

export const pkceCookieName = "chart.auth.pkce";

export function buildKeycloakAuthorizeUrl(input: {
  challenge: string;
  origin: string;
  state: string;
}) {
  const url = new URL(
    `${getKeycloakBrowserBaseUrl(input.origin)}/realms/${getKeycloakRealm()}/protocol/openid-connect/auth`,
  );

  url.search = new URLSearchParams({
    client_id: getKeycloakClientId(),
    code_challenge: input.challenge,
    code_challenge_method: "S256",
    redirect_uri: `${input.origin}/auth/callback`,
    response_type: "code",
    scope: "openid profile email",
    state: input.state,
  }).toString();

  return url;
}

export function buildKeycloakLogoutUrl(request: NextRequest) {
  const origin = getRequestOrigin(request);
  const returnTo = getSafeReturnPath(request.nextUrl.searchParams.get("returnTo"));
  const url = new URL(
    `${getKeycloakBrowserBaseUrl(origin)}/realms/${getKeycloakRealm()}/protocol/openid-connect/logout`,
  );

  url.search = new URLSearchParams({
    client_id: getKeycloakClientId(),
    post_logout_redirect_uri: `${origin}${returnTo}`,
  }).toString();

  return url;
}

export function buildKeycloakTokenUrl(request: NextRequest) {
  return `${getKeycloakServerBaseUrl(request)}/realms/${getKeycloakRealm()}/protocol/openid-connect/token`;
}

export function getKeycloakClientId() {
  return (
    process.env.KEYCLOAK_WEB_CLIENT_ID ??
    process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ??
    "chart-web"
  );
}

function getKeycloakRealm() {
  return (
    process.env.KEYCLOAK_REALM ?? process.env.NEXT_PUBLIC_KEYCLOAK_REALM ?? "chart"
  );
}

function getKeycloakBrowserBaseUrl(origin: string) {
  const configuredUrl =
    process.env.KEYCLOAK_BROWSER_URL ?? process.env.NEXT_PUBLIC_KEYCLOAK_URL;

  if (configuredUrl) {
    return trimTrailingSlash(configuredUrl);
  }

  if (isLocalOrigin(origin)) {
    return process.env.KEYCLOAK_LOCAL_URL ?? "http://127.0.0.1:8080";
  }

  return `${origin}/identity`;
}

function getKeycloakServerBaseUrl(request: NextRequest) {
  const requestOrigin = getRequestOrigin(request);
  const configuredUrl =
    process.env.KEYCLOAK_SERVER_URL ??
    process.env.KEYCLOAK_BROWSER_URL ??
    process.env.NEXT_PUBLIC_KEYCLOAK_URL;

  if (configuredUrl) {
    return trimTrailingSlash(configuredUrl);
  }

  if (isLocalOrigin(requestOrigin)) {
    return process.env.KEYCLOAK_LOCAL_URL ?? "http://127.0.0.1:8080";
  }

  return `${requestOrigin}/identity`;
}

function getSafeReturnPath(returnTo: string | null) {
  if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//")) {
    return "/";
  }

  return returnTo;
}
