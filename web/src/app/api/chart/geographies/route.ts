import { type NextRequest } from "next/server";

import { proxyChartPythonApiRequest } from "@/lib/chartApiProxy";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  return proxyChartPythonApiRequest(request, { path: "geographies" });
}
