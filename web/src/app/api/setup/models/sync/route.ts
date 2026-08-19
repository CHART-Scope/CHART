import { type NextRequest } from "next/server";

import { proxyPythonApiRequest } from "@/lib/pythonApiProxy";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return proxyPythonApiRequest(request, {
    path: "setup/models/sync",
    method: "POST",
  });
}
