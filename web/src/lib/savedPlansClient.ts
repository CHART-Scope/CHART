import { authFetch } from "@/lib/authFetch";
import type { OutlookRatio } from "@/lib/heatOutlookClient";

/**
 * Typed client for saved plans. `/api/chart/:path*` rewrites to the Python
 * API, which resolves the choices, captures the published estimate and keeps
 * each plan private to its owner.
 */

export type PlanChoices = {
  view: "observed" | "projection";
  month?: string | null;
  scenario?: string | null;
  period?: string | null;
  selector?: string | null;
  observed_selector?: string | null;
  reference?: "annual" | "season" | "peak";
};

export type PlanFigure = {
  status: "captured" | "unavailable";
  reason: string | null;
  place: string | null;
  release: string | null;
  when: string | null;
  selector_label: string | null;
  percent: number | null;
  low_percent: number | null;
  high_percent: number | null;
  ratio: OutlookRatio | null;
  heat_season_label: string | null;
  heat_season_months: number[];
};

export type RiskLevel = "elevated" | "possible" | "not_detected" | "unknown";
export type PlanTiming = "before" | "during" | "after";

export type SavedPlan = {
  id: string;
  name: string;
  geography_id: string;
  admin_unit_id: string | null;
  outcome: string;
  choices: PlanChoices;
  figure: PlanFigure;
  signals: { risk_level: RiskLevel; timing: PlanTiming };
  created_at: string;
};

export type SavedPlanInput = {
  name: string;
  geography_id: string;
  admin_unit_id: string | null;
  outcome: string;
  choices: PlanChoices;
};

const ERROR_MESSAGES: Record<string, string> = {
  GEOGRAPHY_OUT_OF_SCOPE: "You do not have access to this place.",
  GEOGRAPHY_NOT_FOUND: "This place no longer exists.",
  PLAN_AREA_INVALID: "This area is not part of the selected place.",
  OUTLOOK_SELECTION_INVALID:
    "The published model does not offer this selection. Change it and try again.",
  SAVED_PLAN_LIMIT: "You have 100 saved plans. Remove one to save another.",
  SAVED_PLAN_NOT_FOUND: "This plan no longer exists.",
};

async function failure(response: Response, fallback: string): Promise<Error> {
  try {
    const body = (await response.json()) as { detail?: unknown; error?: unknown };
    const code = typeof body.detail === "string" ? body.detail : body.error;
    return new Error((typeof code === "string" && ERROR_MESSAGES[code]) || fallback);
  } catch {
    return new Error(fallback);
  }
}

export async function listSavedPlans(signal?: AbortSignal): Promise<SavedPlan[]> {
  const response = await authFetch("/api/chart/saved-plans", {
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw await failure(response, "Saved plans could not load.");
  return ((await response.json()) as { items: SavedPlan[] }).items;
}

export async function getSavedPlan(
  planId: string,
  signal?: AbortSignal,
): Promise<SavedPlan> {
  const response = await authFetch(
    `/api/chart/saved-plans/${encodeURIComponent(planId)}`,
    { cache: "no-store", signal },
  );
  if (!response.ok) throw await failure(response, "This plan could not load.");
  return (await response.json()) as SavedPlan;
}

export async function createSavedPlan(input: SavedPlanInput): Promise<SavedPlan> {
  const response = await authFetch("/api/chart/saved-plans", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await failure(response, "The plan could not be saved.");
  return (await response.json()) as SavedPlan;
}

export async function deleteSavedPlan(planId: string): Promise<void> {
  const response = await authFetch(
    `/api/chart/saved-plans/${encodeURIComponent(planId)}`,
    { method: "DELETE" },
  );
  if (!response.ok) throw await failure(response, "The plan could not be removed.");
}
