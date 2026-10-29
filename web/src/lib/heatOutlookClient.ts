import { authFetch } from "./authFetch";
import { type MapResponse } from "./dashboardClient";

/**
 * Typed client for the published heat outlook: the modelling team's
 * pre-computed tables, filtered by the Python API. Nothing is computed on
 * request, so there is no "preparing" state - a place either has a
 * published file or it does not (404).
 */

export type OutlookOption = { code: string; label: string; exploratory: boolean };

export type OutlookPart = {
  side: "heat" | "cool" | "total";
  value_percent: number | null;
  low_percent: number | null;
  high_percent: number | null;
  /** Shown in place of a suppressed value (the guides' display rules). */
  message: string | null;
};

export type OutlookMonth = {
  month: number;
  tmax_c: number | null;
  parts: OutlookPart[];
  odds_ratio: { value: number; low: number; high: number; at_tmax_c: number } | null;
};

export type OutlookRatio = {
  kind: "odds_ratio" | "risk_ratio";
  value: number;
  low: number;
  high: number;
  precision: "high" | "moderate" | "low";
};

export type OutlookPeriodPart = OutlookPart & {
  ratio: OutlookRatio | null;
  gcm_min_percent: number | null;
  gcm_max_percent: number | null;
  change_pp: number | null;
  change_low_pp: number | null;
  change_high_pp: number | null;
  share_above_p99_percent: number | null;
  thin_data: boolean;
};

export type PeakSeason = {
  months: number[];
  label: string;
  part: OutlookPart;
  gcm_min_percent: number | null;
  gcm_max_percent: number | null;
};

/** The outlook views a country's model settings leave on. */
export type OutlookView = "observed" | "projection";

export type HeatOutlook = {
  geography_id: string;
  place: string;
  level: string;
  outcome: string;
  release: string;
  source_uri: string;
  baseline_period: string;
  reference_note: string;
  metadata_note?: string;
  scenarios: OutlookOption[];
  periods: OutlookOption[];
  selectors: OutlookOption[];
  scenario: string;
  period: string;
  selector: string;
  selector_note: string | null;
  months: OutlookMonth[];
  period_summary: {
    period: string;
    label: string;
    is_baseline: boolean;
    parts: OutlookPeriodPart[];
  }[];
  peak_season: PeakSeason | null;
  data_modes: OutlookView[];
};

export type ObservedInput = {
  label: string;
  era5_c: number | null;
  model_scale_c: number;
  /** Whether the chosen window reads this month. */
  counted: boolean;
};

export type ObservedEstimate = OutlookPart & {
  ratio: OutlookRatio | null;
  thin_data: boolean;
  counties: number;
};

/** An observed month scored from ERA5 with the modeller's DLNM. */
export type ObservedRisk = {
  geography_id: string;
  place: string;
  level: string;
  outcome: string;
  release: string;
  selectors: OutlookOption[];
  selector: string;
  selector_note: string | null;
  month: string | null;
  available_months: string[];
  estimate: ObservedEstimate | null;
  inputs: ObservedInput[];
  history: { month: string; value_percent: number | null }[];
  reference_note: string;
  metadata_note?: string;
  calibration_note: string;
  data_modes: OutlookView[];
};

export type ObservedSelection = { outcome: string; month?: string; selector?: string };

export type OutlookReference = "annual" | "peak";

export type OutlookSelection = {
  outcome: string;
  scenario?: string;
  period?: string;
  selector?: string;
};

export class OutlookNotPublished extends Error {}

export async function fetchHeatOutlook(
  geographyId: string,
  accessToken: string | null | undefined,
  selection: OutlookSelection,
  signal?: AbortSignal,
): Promise<HeatOutlook> {
  const params = new URLSearchParams({ outcome: selection.outcome });
  if (selection.scenario) params.set("scenario", selection.scenario);
  if (selection.period) params.set("period", selection.period);
  if (selection.selector) params.set("selector", selection.selector);
  const response = await authFetch(
    `/api/chart/heat-outlook/${encodeURIComponent(geographyId)}?${params}`,
    { accessToken, signal },
  );
  if (response.status === 404) throw new OutlookNotPublished(geographyId);
  if (!response.ok) throw new Error("The heat outlook could not load.");
  return (await response.json()) as HeatOutlook;
}

/** Counties shaded by their annual-average (or peak-season) share. */
export async function fetchHeatOutlookMap(
  geographyId: string,
  accessToken: string | null | undefined,
  selection: OutlookSelection & { reference?: OutlookReference },
): Promise<MapResponse> {
  const params = new URLSearchParams({ outcome: selection.outcome });
  if (selection.scenario) params.set("scenario", selection.scenario);
  if (selection.period) params.set("period", selection.period);
  if (selection.selector) params.set("selector", selection.selector);
  if (selection.reference) params.set("reference", selection.reference);
  const response = await authFetch(
    `/api/chart/heat-outlook/${encodeURIComponent(geographyId)}/map?${params}`,
    { accessToken },
  );
  if (!response.ok) throw new Error("The heat outlook map could not load.");
  return (await response.json()) as MapResponse;
}

function observedParams(selection: ObservedSelection): URLSearchParams {
  const params = new URLSearchParams({ outcome: selection.outcome });
  if (selection.month) params.set("month", selection.month);
  if (selection.selector) params.set("selector", selection.selector);
  return params;
}

/** One observed month, scored on request from the ERA5 the dashboard holds. */
export async function fetchObservedRisk(
  geographyId: string,
  accessToken: string | null | undefined,
  selection: ObservedSelection,
  signal?: AbortSignal,
): Promise<ObservedRisk> {
  const response = await authFetch(
    `/api/chart/heat-outlook/${encodeURIComponent(geographyId)}/observed?${observedParams(selection)}`,
    { accessToken, signal },
  );
  if (response.status === 404) throw new OutlookNotPublished(geographyId);
  if (!response.ok) throw new Error("The observed estimate could not load.");
  return (await response.json()) as ObservedRisk;
}

/** Counties shaded by their share for one observed month. */
export async function fetchObservedRiskMap(
  geographyId: string,
  accessToken: string | null | undefined,
  selection: ObservedSelection,
): Promise<MapResponse> {
  const response = await authFetch(
    `/api/chart/heat-outlook/${encodeURIComponent(geographyId)}/observed/map?${observedParams(selection)}`,
    { accessToken },
  );
  if (!response.ok) throw new Error("The observed map could not load.");
  return (await response.json()) as MapResponse;
}

export type OutlookCapabilities = {
  published: boolean;
  data_modes: OutlookView[];
  projection_release?: string | null;
  observed?: {
    source: "outlook" | "monthly" | null;
    release: string | null;
    reason: string | null;
    model_area_name: string | null;
    batch_enabled: boolean;
  };
};

export async function fetchOutlookCapabilities(
  geographyId: string,
  accessToken: string,
  outcome: string,
  signal?: AbortSignal,
): Promise<OutlookCapabilities> {
  const params = new URLSearchParams({ outcome });
  const response = await authFetch(
    `/api/chart/heat-outlook/${encodeURIComponent(geographyId)}/capabilities?${params}`,
    { accessToken, signal },
  );
  if (!response.ok) throw new Error("Available outlook views could not load.");
  return response.json() as Promise<OutlookCapabilities>;
}
