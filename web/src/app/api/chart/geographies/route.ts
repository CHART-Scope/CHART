import { type NextRequest } from "next/server";

import { proxyPythonApiRequest } from "@/lib/pythonApiProxy";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  return proxyPythonApiRequest(request, { path: "geographies" });
}
