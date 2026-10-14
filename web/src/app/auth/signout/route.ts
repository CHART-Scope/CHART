import { type NextRequest, NextResponse } from "next/server";

import { buildKeycloakLogoutUrl } from "@/lib/keycloak";
import { clearSessionCookies, idTokenCookieName } from "@/lib/authTokens";

export const runtime = "nodejs";

// Sign-out changes state, so it is a POST: a GET could be triggered by any
// link, image or prefetch and sign the user out without their action.
export function POST(request: NextRequest) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "AUTH_SIGNOUT_FORBIDDEN" }, { status: 403 });
  }
  // 303 so the browser follows with a GET to Keycloak's logout endpoint.
  const response = NextResponse.redirect(
    buildKeycloakLogoutUrl(request, request.cookies.get(idTokenCookieName)?.value),
    303,
  );
  clearSessionCookies(response);
  return response;
}

export function GET() {
  return NextResponse.json(
    { error: "METHOD_NOT_ALLOWED" },
    { status: 405, headers: { allow: "POST" } },
  );
}
