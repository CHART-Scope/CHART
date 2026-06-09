import { type NextRequest, NextResponse } from "next/server";

import { listPublicSolutionTaxonomies } from "@/lib/publicRepository";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return NextResponse.json(await listPublicSolutionTaxonomies(request.nextUrl.origin));
}
