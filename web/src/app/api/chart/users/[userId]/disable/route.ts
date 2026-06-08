import { type NextRequest } from "next/server";

import { proxyChartApiRequest } from "@/lib/chartApiProxy";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;

  return proxyChartApiRequest(request, {
    path: `users/${encodeURIComponent(userId)}/disable`,
    method: "POST",
    authorization: request.headers.get("authorization"),
  });
}
