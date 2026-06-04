import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  return NextResponse.redirect(buildKeycloakLogoutUrl(request));
}

function buildKeycloakLogoutUrl(request: NextRequest) {
  const origin = getRequestOrigin(request);
  const url = new URL(
    `${getKeycloakBrowserBaseUrl(origin)}/realms/${getKeycloakRealm()}/protocol/openid-connect/logout`,
  );

  url.search = new URLSearchParams({
    client_id: getKeycloakClientId(),
    post_logout_redirect_uri: `${origin}/`,
  }).toString();

  return url;
}

function getKeycloakBrowserBaseUrl(origin: string) {
  return trimTrailingSlash(
    process.env.KEYCLOAK_BROWSER_URL ??
      process.env.NEXT_PUBLIC_KEYCLOAK_URL ??
      `${origin}/identity`,
  );
}

function getKeycloakRealm() {
  return (
    process.env.KEYCLOAK_REALM ?? process.env.NEXT_PUBLIC_KEYCLOAK_REALM ?? "chart"
  );
}

function getKeycloakClientId() {
  return (
    process.env.KEYCLOAK_WEB_CLIENT_ID ??
    process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ??
    "chart-web"
  );
}

function getRequestOrigin(request: NextRequest) {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");

  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return new URL(request.url).origin;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/$/, "");
}
