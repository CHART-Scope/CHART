import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return NextResponse.json(
    { buildId: process.env.CHART_BUILD_ID ?? "development" },
    { headers: { "cache-control": "no-store" } },
  );
}
