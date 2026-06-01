import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const pkceCookieName = "chart.auth.pkce";

type TokenResponse = {
  access_token?: string;
  id_token?: string;
  refresh_token?: string;
};

export async function POST(request: NextRequest) {
  const body = await readRequestBody(request);
  const savedPkce = readPkceCookie(request.cookies.get(pkceCookieName)?.value);

  if (!body?.code || !body.state || !savedPkce || savedPkce.state !== body.state) {
    return NextResponse.json({ error: "AUTH_CALLBACK_INVALID" }, { status: 400 });
  }

  const tokenResponse = await fetch(buildKeycloakTokenUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: getKeycloakClientId(),
      code: body.code,
      redirect_uri: `${getRequestOrigin(request)}/auth/callback`,
      code_verifier: savedPkce.verifier,
    }),
  });

  if (!tokenResponse.ok) {
    return NextResponse.json({ error: "TOKEN_EXCHANGE_FAILED" }, { status: 401 });
  }

  const tokens = (await tokenResponse.json()) as TokenResponse;
  const response = NextResponse.json(tokens);

  response.cookies.delete(pkceCookieName);

  return response;
}

async function readRequestBody(request: NextRequest) {
  try {
    const body = (await request.json()) as { code?: unknown; state?: unknown };

    if (typeof body.code !== "string" || typeof body.state !== "string") {
      return null;
    }

    return { code: body.code, state: body.state };
  } catch {
    return null;
  }
}

function readPkceCookie(value?: string) {
  if (!value) {
    return null;
  }

  const [state, verifier] = value.split(".");

  if (!state || !verifier) {
    return null;
  }

  return { state, verifier };
}

function buildKeycloakTokenUrl() {
  return `${getKeycloakServerBaseUrl()}/realms/${getKeycloakRealm()}/protocol/openid-connect/token`;
}

function getKeycloakServerBaseUrl() {
  return process.env.KEYCLOAK_SERVER_URL ?? getKeycloakBaseUrl();
}

function getKeycloakBaseUrl() {
  return process.env.NEXT_PUBLIC_KEYCLOAK_URL ?? "http://127.0.0.1:8080";
}

function getKeycloakRealm() {
  return process.env.NEXT_PUBLIC_KEYCLOAK_REALM ?? "chart";
}

function getKeycloakClientId() {
  return process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ?? "chart-web";
}

function getRequestOrigin(request: NextRequest) {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");

  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return new URL(request.url).origin;
}
