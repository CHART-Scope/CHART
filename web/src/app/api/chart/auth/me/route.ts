import { type NextRequest, NextResponse } from "next/server";

import { getChartApiBaseUrl } from "@/lib/chartApi";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (!authorization) {
    return NextResponse.json({ error: "AUTH_TOKEN_REQUIRED" }, { status: 401 });
  }

  const headers = new Headers({ authorization });
  const activeGeography = request.headers.get("x-chart-active-geography");

  if (activeGeography) {
    headers.set("x-chart-active-geography", activeGeography);
  }

  const response = await fetch(`${getChartApiBaseUrl(request)}/auth/me`, {
    cache: "no-store",
    headers,
  });
  const body = await response.text();

  return new NextResponse(body, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });
}
