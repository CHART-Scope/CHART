import { type NextRequest, NextResponse } from "next/server";

import { buildKeycloakTokenUrl, getKeycloakClientId } from "@/lib/keycloak";
import {
  clearSessionCookies,
  idTokenCookieName,
  type KeycloakTokenResponse,
  publicTokenResponse,
  refreshTokenCookieName,
  setSessionCookies,
} from "@/lib/authTokens";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get(refreshTokenCookieName)?.value;
  if (!refreshToken) {
    return NextResponse.json({ error: "AUTH_SESSION_REQUIRED" }, { status: 401 });
  }

  let response: Response;
  try {
    response = await fetch(buildKeycloakTokenUrl(request), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: getKeycloakClientId(),
        refresh_token: refreshToken,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(keycloakTimeoutMilliseconds()),
    });
  } catch {
    return NextResponse.json({ error: "AUTH_PROVIDER_UNAVAILABLE" }, { status: 503 });
  }
  if (!response.ok) {
    if (response.status >= 500) {
      return NextResponse.json({ error: "AUTH_PROVIDER_UNAVAILABLE" }, { status: 503 });
    }
    const expired = NextResponse.json(
      { error: "AUTH_SESSION_EXPIRED" },
      { status: 401 },
    );
    clearSessionCookies(expired);
    return expired;
  }
  const tokens = await readTokens(response);
  const publicTokens = publicTokenResponse(tokens);
  if (!publicTokens) {
    return NextResponse.json({ error: "AUTH_REFRESH_INVALID" }, { status: 502 });
  }
  const refreshed = NextResponse.json(publicTokens, {
    headers: { "cache-control": "no-store" },
  });
  setSessionCookies(refreshed, request, tokens);
  if (!tokens.id_token) refreshed.cookies.delete(idTokenCookieName);
  return refreshed;
}

async function readTokens(response: Response): Promise<KeycloakTokenResponse> {
  try {
    return (await response.json()) as KeycloakTokenResponse;
  } catch {
    return {};
  }
}

function keycloakTimeoutMilliseconds() {
  const configured = Number(process.env.KEYCLOAK_TIMEOUT_MILLISECONDS ?? 10_000);
  return Number.isFinite(configured) && configured > 0 ? configured : 10_000;
}
