import { type NextRequest } from "next/server";

import { proxyChartPythonApiRequest } from "@/lib/chartApiProxy";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ geographyId: string }> },
) {
  const { geographyId } = await params;

  return proxyChartPythonApiRequest(request, {
    path: `climate/planning-options/${encodeURIComponent(geographyId)}`,
    authorization: request.headers.get("authorization"),
  });
}
