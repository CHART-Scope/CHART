import crypto from "node:crypto";

import { type NextRequest, NextResponse } from "next/server";

import { getRequestOrigin, isSecureRequest } from "@/lib/httpRequest";
import { buildKeycloakAuthorizeUrl, pkceCookieName } from "@/lib/keycloak";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  const state = randomString();
  const verifier = randomString();
  const challenge = base64Url(crypto.createHash("sha256").update(verifier).digest());
  const response = NextResponse.redirect(
    buildKeycloakAuthorizeUrl({
      challenge,
      origin: getRequestOrigin(request),
      state,
    }),
  );
  response.cookies.set(pkceCookieName, `${state}.${verifier}`, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: "/",
    sameSite: "lax",
    secure: isSecureRequest(request),
  });
  return response;
}

function randomString() {
  return base64Url(crypto.randomBytes(32));
}

function base64Url(value: Buffer) {
  return value
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
