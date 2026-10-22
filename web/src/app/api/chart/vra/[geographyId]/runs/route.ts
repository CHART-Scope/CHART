import { type NextRequest } from "next/server";

import { proxyPythonApiRequest } from "@/lib/pythonApiProxy";

export const runtime = "nodejs";

/** Scoring is synchronous, so the budget allows for a large frame. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ geographyId: string }> },
) {
  const { geographyId } = await params;
  return proxyPythonApiRequest(request, {
    path: `vra/${encodeURIComponent(geographyId)}/runs`,
    method: "POST",
    authorization: request.headers.get("authorization"),
    timeoutMs: 120_000,
  });
}
