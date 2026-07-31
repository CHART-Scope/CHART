import { proxyAdminRequest } from "../_proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return proxyAdminRequest(request, "/users");
}

export async function POST(request: Request) {
  return proxyAdminRequest(request, "/users");
}
