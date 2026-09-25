/**
 * Typed client for the dashboard risk endpoints.
 *
 * These endpoints are pure reads: they never trigger ingestion or a
 * prediction run. When a month returns no prediction the caller is expected
 * to (a) show that it is preparing and (b) call planningClient.submitPrediction
 * to queue the work, then poll until the request record reports completed.
 */

export type DashboardScenario =
  "seas5_ensemble" | "rcp26" | "rcp45" | "rcp60" | "rcp85" | string;

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

export type MonthlyRiskValues = {
  prediction?: {
    request_id: number;
    model_release_id: string;
    model_file: string | null;
    model_artifact_sha256: string | null;
    model_artifact_uri: string | null;
    model_runtime_path: string | null;
    n_training: number | null;
    n_events: number | null;
    n_subjects: number | null;
    attributable_fraction_milli: number;
    odds_ratio: number;
    /** Nullable: a release need not declare a reference temperature. The API
     * has always modelled it that way (`MonthlyPrediction`); claiming it
     * non-null here let callers dereference it straight into a crash. */
    reference_temperature_c: number | null;
    reference_kind: string | null;
    ci95_low: number;
    ci95_high: number;
    on_training_support: boolean;
    warning: string | null;
    model_version: string;
    /** The full exposure vector scored, lag 0 first: three months for low
     * birth weight, four days for under five. */
    exposure_temperatures_c?: number[];
    /** Observed days behind a day-grain exposure, lag 0 first. */
    exposure_dates?: string[];
    input_statistic: string;
    fraction_method: string;
    attributable_fraction_policy: string;
  } | null;
  temperature: {
    tmax_monthly_mean_c: number;
    unit: string;
    source_name: string | null;
    climate_run_id: number;
    data_label: string;
  } | null;
  health_impacts: (HealthImpactPoint & {
    horizon: string;
    climate_run_id: number;
  })[];
};

export type AreaBoundingBox = {
  north: number;
  west: number;
  south: number;
  east: number;
};

export type MonthlyRiskResponse = {
  admin_unit_id: number;
  admin_unit_code: string;
  /** The `area` the ERA5 request for this place was made over. Absent for a
   * place whose boundary has not been ingested. */
  area_bbox?: AreaBoundingBox | null;
  months: Record<string, MonthlyRiskValues>;
};

export async function fetchMonthlyRisk(
  geographyId: string,
  accessToken: string,
  signal?: AbortSignal,
  outcome?: string,
): Promise<MonthlyRiskResponse> {
  // The outcome must travel with the request. Without it the endpoint fell
  // back to its default of low birth weight, so selecting under-five mortality
  // relabelled the card while still showing the LBW model's odds ratios and
  // reference - one model's numbers under another model's name.
  const query = outcome ? `?outcome=${encodeURIComponent(outcome)}` : "";
  const response = await fetch(
    `/api/chart/risk/${encodeURIComponent(geographyId)}/monthly${query}`,
    {
      cache: "no-store",
      headers: authHeaders(accessToken),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(30_000)])
        : AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) throw new Error(await readDashboardError(response));
  return (await response.json()) as MonthlyRiskResponse;
}

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
  const response = await fetch(buildRiskUrl(geographyId, "short-term", adminUnit), {
    cache: "no-store",
    headers: authHeaders(accessToken),
  });
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
  const response = await fetch(buildRiskUrl(geographyId, "long-term", adminUnit), {
    cache: "no-store",
    headers: authHeaders(accessToken),
  });
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

export type MapArea = {
  geography_id: string | null;
  admin_unit_id: number;
  code: string;
  name: string;
  level: string;
  value_percent: number | null;
  /** "no_model" | "no_prediction", or null when a value is present. */
  missing_reason: string | null;
  odds_ratio: number | null;
  on_training_support: boolean | null;
  /** GeoJSON geometry, simplified for display only. */
  geometry: { type: string; coordinates: unknown } | null;
};

export type MapResponse = {
  geography_id: string;
  outcome: string;
  month: string | null;
  metric: string;
  unit: string;
  /** [west, south, east, north] */
  bounds: number[];
  simplify_tolerance_degrees: number;
  areas: MapArea[];
};

export async function fetchRiskMap(
  geographyId: string,
  accessToken: string,
  options: { month?: string | null; outcome?: string; signal?: AbortSignal } = {},
): Promise<MapResponse> {
  const params = new URLSearchParams();
  if (options.month) params.set("month", options.month);
  if (options.outcome) params.set("outcome", options.outcome);
  const query = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(
    `/api/chart/risk/${encodeURIComponent(geographyId)}/map${query}`,
    {
      cache: "no-store",
      headers: authHeaders(accessToken),
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(30_000)])
        : AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) throw new Error(await readDashboardError(response));
  return (await response.json()) as MapResponse;
}
