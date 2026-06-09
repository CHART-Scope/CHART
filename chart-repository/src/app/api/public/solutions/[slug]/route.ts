import { type NextRequest, NextResponse } from "next/server";

import { getPublicSolution } from "@/lib/publicRepository";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { slug } = await context.params;
  const solution = await getPublicSolution(slug, request.nextUrl.origin);

  if (!solution) {
    return NextResponse.json({ error: "SOLUTION_NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json(solution);
}
