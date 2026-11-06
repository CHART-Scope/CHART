import { authFetch } from "@/lib/authFetch";
import type { PlanTiming } from "@/lib/savedPlansClient";

/**
 * Typed client for the published recommended actions. The Python API reads
 * them from the public action feed (docs/actions.md) and, given a place,
 * returns its country's actions in that country's wording. Public: no sign-in.
 */

export type CostLevel = "No additional cost" | "Low" | "Medium" | "High" | "Variable";
export type Reference = { citation: string; url: string | null };

export type Action = {
  id: string;
  title: string;
  summary: string;
  description: string;
  hazards: string[];
  health_outcomes: string[];
  target_populations: string[];
  action_types: string[];
  levels: string[];
  seasons: PlanTiming[];
  departments: string[];
  stakeholders: string[];
  cost_level: CostLevel | null;
  cost_reasoning: string;
  rationale: string;
  expected_outcomes: string;
  decision_trigger: string;
  trigger_sources: string[];
  references: Reference[];
  case_studies: Reference[];
  images: { url: string; filename: string }[];
};

export type ActionList = {
  country: string | null;
  source: "feed" | "bundled";
  published_at: string;
  items: Action[];
};

/** The hazard label actions are tagged with for heat. */
export const HEAT_HAZARD = "Extreme heat";

export async function listActions(
  geographyId?: string,
  signal?: AbortSignal,
): Promise<ActionList> {
  const query = geographyId
    ? `?${new URLSearchParams({ geography: geographyId })}`
    : "";
  const response = await authFetch(`/api/chart/actions${query}`, {
    auth: false,
    signal,
  });
  if (!response.ok) throw new Error("Recommended actions could not be loaded.");
  return (await response.json()) as ActionList;
}
