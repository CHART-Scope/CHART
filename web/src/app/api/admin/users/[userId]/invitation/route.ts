import { proxyAdminRequest } from "../../../_proxy";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  return proxyAdminRequest(request, `/users/${encodeURIComponent(userId)}/invitation`);
}
