import { type NextRequest, NextResponse } from "next/server";

import { listPublicSolutions, readPublicRepositoryQuery } from "@/lib/publicRepository";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const response = await listPublicSolutions(
    readPublicRepositoryQuery(request.nextUrl.searchParams),
    request.nextUrl.origin,
  );

  return NextResponse.json(response);
}
