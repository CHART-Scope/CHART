import { type NextRequest } from "next/server";

import { proxyPythonApiRequest } from "@/lib/pythonApiProxy";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return proxyPythonApiRequest(request, {
    path: "climate/prediction-requests",
    authorization: request.headers.get("authorization"),
  });
}
