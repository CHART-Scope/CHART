import { type NextRequest } from "next/server";

import { proxyPythonApiRequest } from "@/lib/pythonApiProxy";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ geographyId: string; areaGeographyId: string }> },
) {
  const { geographyId, areaGeographyId } = await params;
  return proxyPythonApiRequest(request, {
    path: `vra/${encodeURIComponent(geographyId)}/areas/${encodeURIComponent(areaGeographyId)}`,
    authorization: request.headers.get("authorization"),
  });
}
