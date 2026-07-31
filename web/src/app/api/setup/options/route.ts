import { proxySetupRequest } from "../_proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return proxySetupRequest(request, "/options");
}
