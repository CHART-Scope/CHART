import { type NextRequest } from "next/server";

import { proxyChartApiRequest } from "@/lib/chartApiProxy";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  return proxyChartApiRequest(request, { path: "solutions/taxonomies" });
}
