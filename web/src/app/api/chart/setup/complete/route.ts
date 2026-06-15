import { type NextRequest, NextResponse } from "next/server";

import { proxyChartApiRequest } from "@/lib/chartApiProxy";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (!authorization) {
    return NextResponse.json({ error: "AUTH_TOKEN_REQUIRED" }, { status: 401 });
  }

  return proxyChartApiRequest(request, {
    path: "setup/complete",
    method: "POST",
    authorization,
    body: await request.json(),
  });
}
