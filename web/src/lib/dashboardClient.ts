/**
 * Typed client for the dashboard risk endpoints.
 *
 * These endpoints are pure reads: they never trigger ingestion or a
 * prediction run. When a horizon returns an empty payload the caller
 * is expected to (a) render the loading skeleton and (b) call the
 * existing predictionClient.submitLbwPrediction to enqueue the
 * materialization work, then poll again through this module once the
 * request record reports completed.
 */

export type DashboardScenario = "seas5_ensemble" | "rcp26" | "rcp45" | "rcp60" | "rcp85" | string;

export type HealthImpactPoint = {
  valid_month: string;
  relative_risk_milli: number;
  rr_ci_low_milli: number;
  rr_ci_high_milli: number;
  attributable_fraction_milli: number;
  attributable_number: number | null;
  ensemble_spread_milli: number | null;
  scenario: DashboardScenario;
  data_label: string;
};

export type HorizonCard = {
  horizon: "m3" | "m6" | string;
  valid_month: string;
  attributable_fraction_milli: number;
  attributable_number: number | null;
  rr_ci_low_milli: number;
  rr_ci_high_milli: number;
  precision: "high" | "moderate" | "low";
};

export type ShortTermRiskResponse = {
  admin_unit_id: number;
  admin_unit_code: string;
  series: HealthImpactPoint[];
  cards: HorizonCard[];
};

export type LongTermTableRow = {
  horizon: "y5" | "y15" | "y25" | string;
  valid_month: string;
  attributable_fraction_milli: number;
  attributable_number: number | null;
};

export type LongTermScenarioBlock = {
  name: DashboardScenario;
  label: string;
  series: HealthImpactPoint[];
  table: LongTermTableRow[];
};

export type LongTermRiskResponse = {
  admin_unit_id: number;
  admin_unit_code: string;
  scenarios: LongTermScenarioBlock[];
  socioeconomic_baseline: string;
};


export type CurrentObservationResponse = {
  admin_unit_id: number;
  admin_unit_code: string;
  period_month: string | null;
  variable: string | null;
  value: number | null;
  unit: string | null;
  source_name: string | null;
  updated_at: string | null;
};


function authHeaders(accessToken?: string): Record<string, string> {
  return accessToken ? { authorization: `Bearer ${accessToken}` } : {};
}


async function readDashboardError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? "The dashboard could not load.";
  } catch {
    return "The dashboard could not load.";
  }
}


function buildRiskUrl(
  geographyId: string,
  horizon: "short-term" | "long-term",
  adminUnit: string | null,
): string {
  const base = `/api/chart/risk/${encodeURIComponent(geographyId)}/${horizon}`;
  if (!adminUnit) return base;
  return `${base}?${new URLSearchParams({ admin_unit: adminUnit })}`;
}


export async function fetchShortTermRisk(
  geographyId: string,
  adminUnit: string | null,
  accessToken?: string,
): Promise<ShortTermRiskResponse> {
  const response = await fetch(
    buildRiskUrl(geographyId, "short-term", adminUnit),
    { cache: "no-store", headers: authHeaders(accessToken) },
  );
  if (!response.ok) {
    throw new Error(await readDashboardError(response));
  }
  return (await response.json()) as ShortTermRiskResponse;
}


export async function fetchLongTermRisk(
  geographyId: string,
  adminUnit: string | null,
  accessToken?: string,
): Promise<LongTermRiskResponse> {
  const response = await fetch(
    buildRiskUrl(geographyId, "long-term", adminUnit),
    { cache: "no-store", headers: authHeaders(accessToken) },
  );
  if (!response.ok) {
    throw new Error(await readDashboardError(response));
  }
  return (await response.json()) as LongTermRiskResponse;
}


export async function fetchCurrentObservation(
  geographyId: string,
  adminUnit: string | null,
  accessToken?: string,
): Promise<CurrentObservationResponse> {
  const base = `/api/chart/risk/${encodeURIComponent(geographyId)}/current-observation`;
  const url = adminUnit
    ? `${base}?${new URLSearchParams({ admin_unit: adminUnit })}`
    : base;
  const response = await fetch(url, {
    cache: "no-store",
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    throw new Error(await readDashboardError(response));
  }
  return (await response.json()) as CurrentObservationResponse;
}
