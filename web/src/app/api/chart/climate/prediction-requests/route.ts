import { type NextRequest } from "next/server";

import { proxyChartPythonApiRequest } from "@/lib/chartApiProxy";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return proxyChartPythonApiRequest(request, {
    path: "climate/prediction-requests",
    authorization: request.headers.get("authorization"),
  });
}
