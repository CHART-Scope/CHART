import { type NextRequest } from "next/server";

import { proxyPythonApiRequest } from "@/lib/pythonApiProxy";

export const runtime = "nodejs";

export function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return params.then(({ id }) =>
    proxyPythonApiRequest(request, {
      path: `model-releases/${encodeURIComponent(id)}/reload`,
      method: "POST",
    }),
  );
}
