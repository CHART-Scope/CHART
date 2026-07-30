import { type NextRequest, NextResponse } from "next/server";

import { getPythonApiBaseUrl } from "./pythonApi";

type ProxyOptions = {
  path: string;
  method?: "GET" | "POST";
  body?: unknown;
  authorization?: string | null;
  headers?: HeadersInit;
};

export async function proxyPythonApiRequest(
  request: NextRequest,
  { path, method = "GET", body, authorization, headers: extraHeaders }: ProxyOptions,
) {
  const url = new URL(path, `${getPythonApiBaseUrl(request)}/`);
  if (method === "GET") {
    request.nextUrl.searchParams.forEach((value, key) => {
      url.searchParams.set(key, value);
    });
  }

  const headers = new Headers(extraHeaders);
  if (authorization) headers.set("authorization", authorization);
  if (body !== undefined) headers.set("content-type", "application/json");

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      cache: "no-store",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return NextResponse.json({ error: "CHART_API_UNAVAILABLE" }, { status: 502 });
  }

  return new NextResponse(await response.text(), {
    status: response.status,
    headers: {
      "cache-control": "no-store",
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });
}
