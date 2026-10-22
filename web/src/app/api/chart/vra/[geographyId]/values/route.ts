import { type NextRequest } from "next/server";

import { proxyPythonApiRequest } from "@/lib/pythonApiProxy";

export const runtime = "nodejs";

/** A filled template, passed on as CSV text with its `file_name` query. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ geographyId: string }> },
) {
  const { geographyId } = await params;
  return proxyPythonApiRequest(request, {
    path: `vra/${encodeURIComponent(geographyId)}/values`,
    method: "POST",
    authorization: request.headers.get("authorization"),
    headers: { "content-type": request.headers.get("content-type") ?? "text/csv" },
    rawBody: await request.text(),
    forwardQuery: true,
  });
}
