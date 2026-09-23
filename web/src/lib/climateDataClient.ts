/**
 * Typed client for the climate data section in Settings.
 *
 * No proxy route of its own: `/api/chart/:path*` already rewrites to the API,
 * and these calls carry the caller's bearer token the way the risk endpoints
 * do. A `route.ts` would add a file and a 15s proxy timeout for nothing —
 * and a pull must not be held open anyway, since it takes minutes.
 */

export type AreaCoverage = {
  geography_id: string | null;
  admin_unit_id: number;
  code: string;
  name: string;
  months: number;
  earliest: string | null;
  latest: string | null;
};

export type CountryCoverage = {
  country_code: string;
  name: string;
  areas_total: number;
  areas_with_data: number;
  months: number;
  earliest: string | null;
  latest: string | null;
  areas: AreaCoverage[];
};

export type IngestionJobStatus = "queued" | "running" | "completed" | "failed";

export type IngestionJob = {
  id: number;
  country_code: string;
  months: string[];
  status: IngestionJobStatus;
  stage: string;
  areas_total: number;
  areas_done: number;
  error_code: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

function authHeaders(accessToken?: string): Record<string, string> {
  return accessToken ? { authorization: `Bearer ${accessToken}` } : {};
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string; detail?: string };
    return body.error ?? body.detail ?? "The climate data could not be loaded.";
  } catch {
    return "The climate data could not be loaded.";
  }
}

export async function fetchClimateCoverage(
  accessToken: string,
  signal?: AbortSignal,
): Promise<CountryCoverage[]> {
  const response = await fetch("/api/chart/climate/coverage", {
    cache: "no-store",
    headers: authHeaders(accessToken),
    signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(30_000)]),
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as CountryCoverage[];
}

export async function fetchIngestionJobs(
  accessToken: string,
  signal?: AbortSignal,
): Promise<IngestionJob[]> {
  const response = await fetch("/api/chart/climate/ingestion-jobs?limit=20", {
    cache: "no-store",
    headers: authHeaders(accessToken),
    signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(30_000)]),
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as IngestionJob[];
}

/**
 * Queue a pull. Returns immediately with the job to poll — including when a
 * pull for that country is already running, in which case the existing job
 * comes back rather than a second download of the same grid.
 */
export async function startClimatePull(
  accessToken: string,
  countryCode: string,
  months?: string[],
): Promise<IngestionJob> {
  const response = await fetch("/api/chart/climate/ingestion-jobs", {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders(accessToken) },
    body: JSON.stringify({ country_code: countryCode, months: months ?? [] }),
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as IngestionJob;
}
