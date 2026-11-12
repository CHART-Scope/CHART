import { NextResponse } from "next/server";

const ApiUrl = process.env.CHART_PYTHON_API_INTERNAL_URL || "http://127.0.0.1:3210";

export async function proxySetupRequest(request: Request, path: "" | "/options") {
  const baseUrl = ApiUrl.replace(/\/$/, "");
  try {
    const response = await fetch(`${baseUrl}/setup${path}`, {
      method: request.method,
      headers:
        request.method === "GET"
          ? undefined
          : {
              "content-type": request.headers.get("content-type") ?? "application/json",
            },
      body: request.method === "GET" ? undefined : await request.text(),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });

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
