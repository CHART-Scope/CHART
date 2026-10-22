import { type NextRequest, NextResponse } from "next/server";

import { getPythonApiBaseUrl } from "./pythonApi";

type ProxyOptions = {
  path: string;
  method?: "GET" | "POST";
  body?: unknown;
  /** Sent as is (e.g. a CSV upload) instead of a JSON body; set its
   * content-type in `headers`. */
  rawBody?: string;
  /** Pass the browser's query string on. Defaults to GET only. */
  forwardQuery?: boolean;
  authorization?: string | null;
  headers?: HeadersInit;
  /** Upstream budget. Defaults to the browser clients' 30 s so a slow read
   * is not cut off here first. */
  timeoutMs?: number;
};

export async function proxyPythonApiRequest(
  request: NextRequest,
  {
    path,
    method = "GET",
    body,
    rawBody,
    forwardQuery = method === "GET",
    authorization,
    headers: extraHeaders,
    timeoutMs = 30_000,
  }: ProxyOptions,
) {
  const url = new URL(path, `${getPythonApiBaseUrl(request)}/`);
  if (forwardQuery) {
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
      body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
      signal: AbortSignal.timeout(timeoutMs),
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
