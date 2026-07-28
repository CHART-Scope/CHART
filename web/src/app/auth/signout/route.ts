import { type NextRequest, NextResponse } from "next/server";

import { buildKeycloakLogoutUrl } from "@/lib/keycloak";
import { clearSessionCookies, idTokenCookieName } from "@/lib/authTokens";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  const response = NextResponse.redirect(
    buildKeycloakLogoutUrl(request, request.cookies.get(idTokenCookieName)?.value),
  );
  clearSessionCookies(response);
  return response;
}
