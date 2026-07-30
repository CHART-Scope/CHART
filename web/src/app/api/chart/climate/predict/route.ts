import { type NextRequest } from "next/server";

import { proxyPythonApiRequest } from "@/lib/pythonApiProxy";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return proxyPythonApiRequest(request, {
    path: "climate/predict",
    method: "POST",
    authorization: request.headers.get("authorization"),
    body: await request.json(),
  });
}
