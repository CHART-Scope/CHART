import { authFetch } from "@/lib/authFetch";

/**
 * Typed client for plan recommendations and how they are produced. The
 * Python API ranks the actions and writes the insight; provider credentials
 * never reach the browser.
 */

export type PlanRecommendationResult = {
  ranker: string;
  ranker_model: string | null;
  ranker_note: string | null;
  items: { id: string; reasons: string[] }[];
  insight: {
    provider: string;
    model: string | null;
    text: string;
    generated: boolean;
    note: string | null;
  };
};

export type ProviderOption = {
  id: string;
  label: string;
  available: boolean;
  reason: string | null;
};

export type RecommendationSettingsValues = {
  ranker: string;
  insight_provider: string;
  insight_model: string | null;
};

export type RecommendationSettings = {
  settings: RecommendationSettingsValues;
  rankers: ProviderOption[];
  providers: ProviderOption[];
  updated_by_user_id: string | null;
  updated_at: string | null;
};

export type ProviderModels = {
  provider: string;
  models: string[];
  source: "provider" | "configured" | "none";
};

const ERROR_MESSAGES: Record<string, string> = {
  RANKER_NOT_CONFIGURED: "That ranker is not configured on the server.",
  INSIGHT_PROVIDER_NOT_CONFIGURED: "That provider is not configured on the server.",
  INSIGHT_MODEL_REQUIRED: "Choose a model for this provider.",
  INSIGHT_MODELS_UNAVAILABLE:
    "The provider's models could not be listed. Type the model ID instead.",
  SAVED_PLAN_NOT_FOUND: "This plan no longer exists.",
  GEOGRAPHY_OUT_OF_SCOPE: "You do not have access to this place.",
};

async function failure(response: Response, fallback: string): Promise<Error> {
  try {
    const body = (await response.json()) as { error?: unknown };
    const code = typeof body.error === "string" ? body.error : "";
    return new Error(ERROR_MESSAGES[code] ?? fallback);
  } catch {
    return new Error(fallback);
  }
}

export async function fetchPlanRecommendations(
  planId: string,
  signal?: AbortSignal,
): Promise<PlanRecommendationResult> {
  const response = await authFetch(
    `/api/chart/saved-plans/${encodeURIComponent(planId)}/recommendations`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 3 }),
      signal,
      // A language model may take a while to write the insight.
      timeoutMs: 60_000,
    },
  );
  if (!response.ok) throw await failure(response, "Recommendations could not load.");
  return (await response.json()) as PlanRecommendationResult;
}

export async function fetchRecommendationSettings(
  signal?: AbortSignal,
): Promise<RecommendationSettings> {
  const response = await authFetch("/api/chart/recommendation-settings", {
    cache: "no-store",
    signal,
  });
  if (!response.ok)
    throw await failure(response, "Recommendation settings could not load.");
  return (await response.json()) as RecommendationSettings;
}

export async function saveRecommendationSettings(
  values: RecommendationSettingsValues,
): Promise<RecommendationSettings> {
  const response = await authFetch("/api/chart/recommendation-settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
  if (!response.ok)
    throw await failure(response, "Recommendation settings could not be saved.");
  return (await response.json()) as RecommendationSettings;
}

export async function fetchProviderModels(
  provider: string,
  signal?: AbortSignal,
): Promise<ProviderModels> {
  const response = await authFetch(
    `/api/chart/recommendation-settings/providers/${encodeURIComponent(provider)}/models`,
    { cache: "no-store", signal, timeoutMs: 30_000 },
  );
  if (!response.ok) throw await failure(response, "Models could not be listed.");
  return (await response.json()) as ProviderModels;
}
