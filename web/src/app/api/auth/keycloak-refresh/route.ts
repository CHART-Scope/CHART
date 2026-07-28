import { type NextRequest, NextResponse } from "next/server";

import { buildKeycloakTokenUrl, getKeycloakClientId } from "@/lib/keycloak";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const refreshToken = await readRefreshToken(request);

  if (!refreshToken) {
    return NextResponse.json({ error: "AUTH_REFRESH_TOKEN_REQUIRED" }, { status: 400 });
  }

  let tokenResponse: Response;
  try {
    tokenResponse = await fetch(buildKeycloakTokenUrl(request), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: getKeycloakClientId(),
        refresh_token: refreshToken,
      }),
    });
  } catch {
    return NextResponse.json({ error: "AUTH_IDENTITY_UNAVAILABLE" }, { status: 502 });
  }

  if (!tokenResponse.ok) {
    return NextResponse.json({ error: "AUTH_SESSION_EXPIRED" }, { status: 401 });
  }

  return NextResponse.json(await tokenResponse.json(), {
    headers: { "Cache-Control": "no-store" },
  });
}

async function readRefreshToken(request: NextRequest) {
  try {
    const body = (await request.json()) as { refreshToken?: unknown };
    return typeof body.refreshToken === "string" && body.refreshToken
      ? body.refreshToken
      : null;
  } catch {
    return null;
  }
}
