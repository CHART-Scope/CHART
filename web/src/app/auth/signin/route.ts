import crypto from "node:crypto";

import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const pkceCookieName = "chart.auth.pkce";
const pkceCookieMaxAgeSeconds = 10 * 60;

export function GET(request: NextRequest) {
  const origin = getRequestOrigin(request);
  const state = createRandomString();
  const verifier = createRandomString();
  const challenge = createCodeChallenge(verifier);
  const response = NextResponse.redirect(
    buildKeycloakAuthorizeUrl({
      challenge,
      origin,
      state,
    }),
  );

  response.cookies.set(pkceCookieName, `${state}.${verifier}`, {
    httpOnly: true,
    maxAge: pkceCookieMaxAgeSeconds,
    path: "/",
    sameSite: "lax",
    secure: isSecureRequest(request),
  });

  return response;
}

function buildKeycloakAuthorizeUrl(input: {
  challenge: string;
  origin: string;
  state: string;
}) {
  const url = new URL(
    `${getKeycloakBaseUrl()}/realms/${getKeycloakRealm()}/protocol/openid-connect/auth`,
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

function isSecureRequest(request: NextRequest) {
  return (
    new URL(request.url).protocol === "https:" ||
    request.headers.get("x-forwarded-proto") === "https"
  );
}

function createRandomString() {
  return base64UrlEncode(crypto.randomBytes(32));
}

function createCodeChallenge(verifier: string) {
  return base64UrlEncode(crypto.createHash("sha256").update(verifier).digest());
}

function base64UrlEncode(bytes: Buffer) {
  return bytes
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
