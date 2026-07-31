import { NextResponse } from "next/server";

const BACKEND_URL =
  process.env.CHART_PYTHON_API_INTERNAL_URL || "http://127.0.0.1:3210";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return NextResponse.json({ error: "SETUP_UNAUTHENTICATED" }, { status: 401 });
  }
  try {
    const response = await fetch(
      `${BACKEND_URL.replace(/\/$/, "")}/setup/reset`,
      {
        method: "POST",
        headers: { authorization },
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      },
    );
    return new Response(response.body, {
      status: response.status,
      headers: {
        "content-type":
          response.headers.get("content-type") ?? "application/json; charset=utf-8",
      },
    });
  } catch {
    return NextResponse.json({ error: "SETUP_SERVICE_UNAVAILABLE" }, { status: 502 });
  }
}
