import { type NextRequest, NextResponse } from "next/server";

import { listPublicHealthImplications } from "@/lib/publicRepository";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return NextResponse.json(await listPublicHealthImplications(request.nextUrl.origin));
}
