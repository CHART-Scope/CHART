import { type NextRequest } from "next/server";

import { proxyPythonApiRequest } from "@/lib/pythonApiProxy";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  // The API authorises a sync against the caller's admin role, so the token
  // has to be forwarded; without it every sync answered 401. Verifying and
  // preparing artifacts takes a while, hence the longer budget.
  return proxyPythonApiRequest(request, {
    path: "setup/models/sync",
    method: "POST",
    authorization: request.headers.get("authorization"),
    timeoutMs: 60_000,
  });
}
