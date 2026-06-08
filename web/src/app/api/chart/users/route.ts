import { type NextRequest } from "next/server";

import { proxyChartApiRequest } from "@/lib/chartApiProxy";

export async function GET(request: NextRequest) {
  return proxyChartApiRequest(request, {
    path: "users",
    authorization: request.headers.get("authorization"),
  });
}

export async function POST(request: NextRequest) {
  return proxyChartApiRequest(request, {
    path: "users",
    method: "POST",
    authorization: request.headers.get("authorization"),
    body: await request.json(),
  });
}
