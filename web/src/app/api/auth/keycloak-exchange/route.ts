import { type NextRequest, NextResponse } from "next/server";

import {
  buildKeycloakTokenUrl,
  getKeycloakClientId,
  pkceCookieName,
} from "@/lib/keycloak";
import { getRequestOrigin } from "@/lib/httpRequest";
import {
  type KeycloakTokenResponse,
  publicTokenResponse,
  setSessionCookies,
} from "@/lib/authTokens";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = await readBody(request);
  const saved = readPkce(request.cookies.get(pkceCookieName)?.value);
  if (!body || !saved || body.state !== saved.state) {
    return NextResponse.json({ error: "AUTH_CALLBACK_INVALID" }, { status: 400 });
  }

  let tokenResponse: Response;
  try {
    tokenResponse = await fetch(buildKeycloakTokenUrl(request), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: getKeycloakClientId(),
        code: body.code,
        redirect_uri: `${getRequestOrigin(request)}/auth/callback`,
        code_verifier: saved.verifier,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(keycloakTimeoutMilliseconds()),
    });
  } catch {
    return NextResponse.json({ error: "AUTH_PROVIDER_UNAVAILABLE" }, { status: 503 });
  }
  if (!tokenResponse.ok) {
    return NextResponse.json(
      {
        error:
          tokenResponse.status >= 500
            ? "AUTH_PROVIDER_UNAVAILABLE"
            : "TOKEN_EXCHANGE_FAILED",
      },
      { status: tokenResponse.status >= 500 ? 503 : 401 },
    );
  }

  const tokens = await readTokens(tokenResponse);
  const publicTokens = publicTokenResponse(tokens);
  if (!publicTokens || !tokens.refresh_token) {
    return NextResponse.json({ error: "TOKEN_EXCHANGE_INVALID" }, { status: 502 });
  }
  const response = NextResponse.json(publicTokens, {
    headers: { "cache-control": "no-store" },
  });
  setSessionCookies(response, request, tokens);
  response.cookies.delete(pkceCookieName);
  return response;
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

async function readBody(request: NextRequest) {
  try {
    const body = (await request.json()) as { code?: unknown; state?: unknown };
    return typeof body.code === "string" && typeof body.state === "string"
      ? { code: body.code, state: body.state }
      : null;
  } catch {
    return null;
  }
}

function readPkce(value?: string) {
  if (!value) return null;
  const [state, verifier] = value.split(".");
  return state && verifier ? { state, verifier } : null;
}
