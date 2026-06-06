import type { NextRequest } from "next/server";

export function getRequestOrigin(request: NextRequest) {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");

  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return new URL(request.url).origin;
}

export function isSecureRequest(request: NextRequest) {
  return (
    new URL(request.url).protocol === "https:" ||
    request.headers.get("x-forwarded-proto") === "https"
  );
}

export function isLocalOrigin(origin: string) {
  const hostname = new URL(origin).hostname;

  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function trimTrailingSlash(value: string) {
  return value.replace(/\/$/, "");
}
