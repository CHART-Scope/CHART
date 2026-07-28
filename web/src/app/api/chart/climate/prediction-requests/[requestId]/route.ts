import { type NextRequest } from "next/server";

import { proxyChartPythonApiRequest } from "@/lib/chartApiProxy";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const { requestId } = await params;

  return proxyChartPythonApiRequest(request, {
    path: `climate/prediction-requests/${encodeURIComponent(requestId)}`,
    authorization: request.headers.get("authorization"),
  });
}
