import { type NextRequest } from "next/server";

import { proxyPythonApiRequest } from "@/lib/pythonApiProxy";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ geographyId: string }> },
) {
  const { geographyId } = await params;
  return proxyPythonApiRequest(request, {
    path: `vra/${encodeURIComponent(geographyId)}/template.csv`,
    authorization: request.headers.get("authorization"),
  });
}
