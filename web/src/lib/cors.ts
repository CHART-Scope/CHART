import { NextRequest, NextResponse } from "next/server";

const defaultAllowedOrigins = ["http://127.0.0.1:3100", "http://localhost:3100"];

function resolveAllowedOrigin(request: NextRequest) {
  const requestOrigin = request.headers.get("origin");
  const configuredOrigin = process.env.CHART_WEB_ORIGIN;
  const allowedOrigins = configuredOrigin
    ? [...defaultAllowedOrigins, configuredOrigin]
    : defaultAllowedOrigins;

  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }

  return allowedOrigins[0];
}

export function createCorsHeaders(request: NextRequest) {
  return {
    "Access-Control-Allow-Origin": resolveAllowedOrigin(request),
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  };
}

export function corsJson(request: NextRequest, body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...createCorsHeaders(request),
      ...(init?.headers ?? {}),
    },
  });
}

export function corsOptions(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: createCorsHeaders(request),
  });
}
