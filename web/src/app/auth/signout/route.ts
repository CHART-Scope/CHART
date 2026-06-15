import { type NextRequest, NextResponse } from "next/server";

import { buildKeycloakLogoutUrl } from "@/lib/keycloak";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  return NextResponse.redirect(buildKeycloakLogoutUrl(request));
}
