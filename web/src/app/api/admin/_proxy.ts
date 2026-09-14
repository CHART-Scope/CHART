import { NextResponse } from "next/server";

const defaultPythonApiUrl = "http://127.0.0.1:3210";

export async function proxyAdminRequest(request: Request, path: string) {
  const baseUrl = (
    process.env.CHART_PYTHON_API_INTERNAL_URL ?? defaultPythonApiUrl
  ).replace(/\/$/, "");
  const authorization = request.headers.get("authorization");

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: request.method,
      headers: {
        ...(authorization ? { authorization } : {}),
        ...(request.method === "GET"
          ? {}
          : {
              "content-type": request.headers.get("content-type") ?? "application/json",
            }),
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
    return NextResponse.json({ error: "ADMIN_SERVICE_UNAVAILABLE" }, { status: 502 });
  }
}
