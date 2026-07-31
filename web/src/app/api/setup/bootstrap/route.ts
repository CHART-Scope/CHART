import { proxySetupRequest } from "../_proxy";

export async function POST(request: Request) {
  return proxySetupRequest(request, "/bootstrap");
}
