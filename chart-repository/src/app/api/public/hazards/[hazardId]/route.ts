import { type NextRequest, NextResponse } from "next/server";

import { getPublicHazard } from "@/lib/publicRepository";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    hazardId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { hazardId } = await context.params;
  const hazard = await getPublicHazard(hazardId, request.nextUrl.origin);

  if (!hazard) {
    return NextResponse.json({ error: "HAZARD_NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json(hazard);
}
