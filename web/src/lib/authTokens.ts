import { type NextRequest, NextResponse } from "next/server";

import { isSecureRequest } from "./httpRequest";

export const refreshTokenCookieName = "chart.auth.refresh";
export const idTokenCookieName = "chart.auth.id";
/** The cookies' lifetime when Keycloak names none: its 30-day session. */
const SESSION_FALLBACK_SECONDS = 30 * 24 * 60 * 60;

export type KeycloakTokenResponse = {
  access_token?: string;
  expires_in?: number;
  id_token?: string;
  refresh_expires_in?: number;
  refresh_token?: string;
  token_type?: string;
};

export function publicTokenResponse(tokens: KeycloakTokenResponse) {
  if (!tokens.access_token) return null;
  return {
    access_token: tokens.access_token,
    expires_in: tokens.expires_in,
    token_type: tokens.token_type,
  };
}

export function setSessionCookies(
  response: NextResponse,
  request: NextRequest,
  tokens: KeycloakTokenResponse,
) {
  const options = {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: isSecureRequest(request),
  };
  if (tokens.refresh_token) {
    response.cookies.set(refreshTokenCookieName, tokens.refresh_token, {
      ...options,
      maxAge: positiveSeconds(tokens.refresh_expires_in, SESSION_FALLBACK_SECONDS),
    });
  }
  if (tokens.id_token) {
    response.cookies.set(idTokenCookieName, tokens.id_token, {
      ...options,
      maxAge: positiveSeconds(tokens.refresh_expires_in, SESSION_FALLBACK_SECONDS),
    });
  }
}

export function clearSessionCookies(response: NextResponse) {
  response.cookies.delete(refreshTokenCookieName);
  response.cookies.delete(idTokenCookieName);
}

function positiveSeconds(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}
