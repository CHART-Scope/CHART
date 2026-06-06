import { type NextRequest, NextResponse } from "next/server";

import { getChartApiBaseUrl } from "./chartApi";

type ProxyOptions = {
  path: string;
  method?: "GET" | "POST";
  body?: unknown;
  authorization?: string | null;
};

export async function proxyChartApiRequest(
  request: NextRequest,
  { path, method = "GET", body, authorization }: ProxyOptions,
) {
  const url = new URL(path, `${getChartApiBaseUrl(request)}/`);

  if (method === "GET") {
    request.nextUrl.searchParams.forEach((value, key) => {
      url.searchParams.set(key, value);
    });
  }

  const headers = new Headers();

  if (authorization) {
    headers.set("authorization", authorization);
  }

  if (body !== undefined) {
    headers.set("content-type", "application/json");
  }

  const response = await fetchChartApi(url, {
    method,
    cache: "no-store",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const responseBody = await response.text();

  return new NextResponse(responseBody, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });
}

async function fetchChartApi(url: URL, init: RequestInit) {
  try {
    return await fetch(url, init);
  } catch {
    return NextResponse.json({ error: "CHART_API_UNAVAILABLE" }, { status: 502 });
  }
}
