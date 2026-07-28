import type { NextRequest } from "next/server";

export function getRequestOrigin(request: NextRequest) {
  const configured = process.env.CHART_WEB_ORIGIN;
  if (configured) return new URL(configured).origin;

  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");

  if (
    (forwardedProto === "http" || forwardedProto === "https") &&
    forwardedHost &&
    isSafeForwardedHost(forwardedHost)
  ) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return new URL(request.url).origin;
}

export function isSecureRequest(request: NextRequest) {
  const configuredOrigin = process.env.CHART_WEB_ORIGIN;
  return (
    (configuredOrigin ? new URL(configuredOrigin).protocol === "https:" : false) ||
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

function isSafeForwardedHost(value: string) {
  if (!/^[a-zA-Z0-9.-]+(?::[0-9]{1,5})?$/.test(value)) return false;
  const port = value.split(":")[1];
  return port === undefined || Number(port) <= 65535;
}
