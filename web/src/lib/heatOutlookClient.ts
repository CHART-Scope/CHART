import { type MapResponse } from "./dashboardClient";

/**
 * Typed client for the Kenya heat outlook: the modelling team's
 * pre-computed tables, filtered by the Python API. Nothing is computed on
 * request, so there is no "preparing" state - a place either has a
 * published file or it does not (404).
 */

export type OutlookOption = { code: string; label: string; exploratory: boolean };

export type OutlookPart = {
  side: "heat" | "cool";
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

export type HeatOutlook = {
  geography_id: string;
  place: string;
  level: "county" | "country";
  outcome: string;
  release: string;
  source_uri: string;
  baseline_period: string;
  reference_note: string;
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
};

export type OutlookSelection = {
  outcome: string;
  scenario?: string;
  period?: string;
  selector?: string;
};

export class OutlookNotPublished extends Error {}

export async function fetchHeatOutlook(
  geographyId: string,
  accessToken: string,
  selection: OutlookSelection,
  signal?: AbortSignal,
): Promise<HeatOutlook> {
  const params = new URLSearchParams({ outcome: selection.outcome });
  if (selection.scenario) params.set("scenario", selection.scenario);
  if (selection.period) params.set("period", selection.period);
  if (selection.selector) params.set("selector", selection.selector);
  const response = await fetch(
    `/api/chart/heat-outlook/${encodeURIComponent(geographyId)}?${params}`,
    {
      cache: "no-store",
      headers: { authorization: `Bearer ${accessToken}` },
      signal,
    },
  );
  if (response.status === 404) throw new OutlookNotPublished(geographyId);
  if (!response.ok) throw new Error("The heat outlook could not load.");
  return (await response.json()) as HeatOutlook;
}

/** Counties shaded by their annual-average share for one selection. */
export async function fetchHeatOutlookMap(
  geographyId: string,
  accessToken: string,
  selection: OutlookSelection,
): Promise<MapResponse> {
  const params = new URLSearchParams({ outcome: selection.outcome });
  if (selection.scenario) params.set("scenario", selection.scenario);
  if (selection.period) params.set("period", selection.period);
  if (selection.selector) params.set("selector", selection.selector);
  const response = await fetch(
    `/api/chart/heat-outlook/${encodeURIComponent(geographyId)}/map?${params}`,
    { cache: "no-store", headers: { authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) throw new Error("The heat outlook map could not load.");
  return (await response.json()) as MapResponse;
}
