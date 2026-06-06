import type { NextRequest } from "next/server";

import { getRequestOrigin, isLocalOrigin, trimTrailingSlash } from "./httpRequest";

export function getChartApiBaseUrl(request: NextRequest) {
  const configuredUrl =
    process.env.CHART_API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_CHART_API_URL;

  if (configuredUrl) {
    return trimTrailingSlash(configuredUrl);
  }

  const requestOrigin = getRequestOrigin(request);

  if (isLocalOrigin(requestOrigin)) {
    return process.env.CHART_LOCAL_API_URL ?? "http://127.0.0.1:3200";
  }

  return `${requestOrigin}/chart-api`;
}
