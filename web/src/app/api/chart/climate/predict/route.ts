import { type NextRequest } from "next/server";

import { proxyChartPythonApiRequest } from "@/lib/chartApiProxy";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return proxyChartPythonApiRequest(request, {
    path: "climate/predict",
    method: "POST",
    authorization: request.headers.get("authorization"),
    body: await request.json(),
  });
}
