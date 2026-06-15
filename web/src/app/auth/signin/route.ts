import crypto from "node:crypto";

import { type NextRequest, NextResponse } from "next/server";

import { buildKeycloakAuthorizeUrl, pkceCookieName } from "@/lib/keycloak";
import { getRequestOrigin, isSecureRequest } from "@/lib/httpRequest";

export const runtime = "nodejs";

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
