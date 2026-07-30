import { type NextRequest, NextResponse } from "next/server";

import { proxyPythonApiRequest } from "@/lib/pythonApiProxy";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return NextResponse.json({ error: "AUTH_TOKEN_REQUIRED" }, { status: 401 });
  }

  const activeGeography = request.headers.get("x-chart-active-geography");
  return proxyPythonApiRequest(request, {
    path: "auth/me",
    authorization,
    headers: activeGeography
      ? { "x-chart-active-geography": activeGeography }
      : undefined,
  });
}
