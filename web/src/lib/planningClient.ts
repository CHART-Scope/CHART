export type GeographyRecord = {
  id: string;
  name: string;
  path: string;
  levelLabel: string;
  supportsPrediction?: boolean;
  parentId?: string | null;
  modelAreaName?: string | null;
  models?: {
    outcome: string;
    modelAreaName: string;
    releaseId: string;
  }[];
};

export type PlanningTarget =
  "month" | "next_three_months" | "next_heat_season" | "long_term_hot_season";

export type PredictionStatus =
  "waiting" | "queued" | "running" | "completed" | "failed";

export type PredictionStage =
  | "waiting_for_data"
  | "queued"
  | "preparing_climate"
  | "climate_ready"
  | "predicting"
  | "completed"
  | "failed";

export type ClimateMonth = {
  month: string;
  temperature_c: number | null;
  status: "waiting" | "ready" | "stale" | "sample" | "failed";
  source_name: string | null;
  source_class: string | null;
  source_uri: string | null;
  source_issue_time: string | null;
  downloaded_at: string | null;
  raw_file_hash: string | null;
  scenario: string | null;
  projection_period: string | null;
  ensemble_summary: string | null;
  expected_source_name: string;
};

export type LbwPrediction = {
  area: string;
  geography_level: string;
  temperatures_c: number[];
  reference_temperature_c: number;
  odds_ratio: number;
  ci95_low: number;
  ci95_high: number;
  on_training_support: boolean;
  model_file: string;
  model_version: string;
  model_sha256: string | null;
  warning: string | null;
};

export type PredictionResult = {
  request_id: number;
  request_status: "completed";
  planning_date: string;
  source_as_of: string | null;
  climate: ClimateMonth[];
  planning_target: PlanningTarget;
  projection_scenario: "ssp126" | "ssp370" | "ssp585" | null;
  projection_period: "2031-2040" | null;
  prediction: LbwPrediction;
  predictions: LbwPrediction[];
};

export type PredictionRequest = {
  request_id: number;
  status: PredictionStatus;
  stage: PredictionStage;
  geography_id: string;
  planning_date: string;
  source_as_of: string | null;
  dagster_run_id: string | null;
  error_code: string | null;
  climate: ClimateMonth[];
  result: PredictionResult | null;
  created_at: string;
  updated_at: string;
  available_from: string | null;
  planning_target: PlanningTarget;
  projection_scenario: "ssp126" | "ssp370" | "ssp585" | null;
  projection_period: "2031-2040" | null;
};

export type PredictionSummary = Omit<
  PredictionRequest,
  "climate" | "result" | "dagster_run_id"
> & {
  odds_ratio: number | null;
};

export type PlanningOptions = {
  geography_id: string;
  source_as_of: string;
  custom_min_month: string;
  custom_max_month: string;
  validated_pregnancy_windows: number[];
  next_three_months: PlanningChoice;
  next_heat_season: PlanningChoice | null;
  long_term_projection: {
    label: string;
    period: "2031-2040";
    months: string[];
    planning_date: string;
    scenarios: {
      value: "ssp126" | "ssp370" | "ssp585";
      label: string;
      description: string;
    }[];
  } | null;
};

type PlanningChoice = {
  label: string;
  months: string[];
  planning_date: string;
  available: boolean;
  available_from: string | null;
  unavailable_reason: string | null;
};

type PredictionAccepted = {
  request_id: number;
  status: "waiting" | "queued" | "running";
  stage: PredictionStage;
  geography_id: string;
  planning_date: string;
  source_as_of: string | null;
  available_from: string | null;
  planning_target: PlanningTarget;
  projection_scenario: "ssp126" | "ssp370" | "ssp585" | null;
  projection_period: "2031-2040" | null;
};

export async function listGeographies() {
  return request<GeographyRecord[]>("/api/chart/geographies");
}

export type ModelCatalogEntry = {
  climate_hazard: string;
  climate_hazard_label: string;
  health_domain: string;
  health_domain_label: string;
  outcome: string;
  outcome_label: string;
  dashboard_title: string | null;
  population_label: string | null;
  model_scope_label: string | null;
  effect_measure: string | null;
  batch_status: string | null;
  visualization_type: string | null;
  visualization_figure: "newborn" | "baby" | "mother-baby" | null;
  visualization_context_figure: "pregnant-woman" | "baby" | null;
  risk_description: string | null;
  release_ids: string[];
};

export async function listModelCatalog(
  geographyId?: string,
  options: { includeDescendants?: boolean } = {},
) {
  const params = new URLSearchParams();
  if (geographyId) params.set("geography_id", geographyId);
  if (options.includeDescendants) params.set("include_descendants", "true");
  const query = params.size > 0 ? `?${params}` : "";
  const response = await request<{ items: ModelCatalogEntry[] }>(
    `/api/chart/model-catalog${query}`,
  );
  return response.items;
}

export async function getPlanningOptions(geographyId: string, accessToken: string) {
  return request<PlanningOptions>(
    `/api/chart/climate/planning-options/${encodeURIComponent(geographyId)}`,
    accessToken,
  );
}

export async function listPredictionRequests(geographyId: string, accessToken: string) {
  const query = new URLSearchParams({ geography_id: geographyId, limit: "10" });
  const response = await request<{ items: PredictionSummary[] }>(
    `/api/chart/climate/prediction-requests?${query}`,
    accessToken,
  );
  return response.items;
}

export async function getPredictionRequest(requestId: number, accessToken: string) {
  return request<PredictionRequest>(
    `/api/chart/climate/prediction-requests/${requestId}`,
    accessToken,
  );
}

export type RecommendedActionAsset = {
  filename: string;
  type?: string;
  size?: number;
  url?: string;
};

export type RecommendedActionLink = {
  url: string;
  label: string;
};

export type RecommendedAction = {
  slug: string;
  title: string;
  description: string;
  categories: string[];
  hazards: string[];
  cost: "low" | "medium" | "high" | null;
  links: RecommendedActionLink[];
  caseStudies: RecommendedActionAsset[];
};

type SolutionsPayload = {
  items?: {
    slug: string;
    name?: string;
    title?: string;
    description?: string;
    taxonomies?: { type: string; label: string }[];
    solutionTypes?: string[];
    climateHazards?: string[];
    costOfImplementation?: string;
    links?: { url: string; label?: string }[];
    usefulLinks?: string[];
    assets?: { filename?: string; type?: string; size?: number; url?: string }[];
    caseStudies?: { filename?: string; type?: string; size?: number }[];
  }[];
};

export async function listRecommendedActions(
  options: { limit?: number; hazard?: string } = {},
) {
  const { limit = 7, hazard } = options;
  const params = new URLSearchParams({
    limit: String(limit),
    status: "published",
  });
  if (hazard) params.set("hazard", hazard);
  const payload = await request<SolutionsPayload>(
    `/api/chart/recommended-actions?${params}`,
  );
  return (payload.items ?? []).map(toRecommendedAction);
}

function toRecommendedAction(
  item: NonNullable<SolutionsPayload["items"]>[number],
): RecommendedAction {
  const categoriesFromTax = (item.taxonomies ?? [])
    .filter((tax) => tax.type === "solution_type")
    .map((tax) => tax.label);
  const hazardsFromTax = (item.taxonomies ?? [])
    .filter((tax) => tax.type === "hazard")
    .map((tax) => tax.label);
  const links: RecommendedActionLink[] = (item.links ?? []).map((link) => ({
    url: link.url,
    label: link.label ?? hostnameOf(link.url),
  }));
  if (links.length === 0) {
    for (const url of item.usefulLinks ?? []) {
      links.push({ url, label: hostnameOf(url) });
    }
  }
  const caseStudies: RecommendedActionAsset[] = (item.assets ?? item.caseStudies ?? [])
    .filter(
      (
        asset,
      ): asset is { filename?: string; type?: string; size?: number; url?: string } =>
        Boolean(asset),
    )
    .map((asset) => ({
      filename: asset.filename ?? "Attachment",
      type: asset.type,
      size: asset.size,
      url: "url" in asset ? asset.url : undefined,
    }));

  return {
    slug: item.slug,
    title: item.name ?? item.title ?? item.slug,
    description: item.description ?? "",
    categories:
      categoriesFromTax.length > 0 ? categoriesFromTax : (item.solutionTypes ?? []),
    hazards: hazardsFromTax.length > 0 ? hazardsFromTax : (item.climateHazards ?? []),
    cost: normalizeCost(item.costOfImplementation),
    links,
    caseStudies,
  };
}

function normalizeCost(value?: string): RecommendedAction["cost"] {
  const key = value?.toLowerCase();
  if (key === "low" || key === "medium" || key === "high") return key;
  return null;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export type WhatIfScore = {
  geography_id: string;
  temperature_c: number;
  outcome: string;
  area: string;
  geography_level: string;
  pregnancy_window: 1 | 2 | 3 | null;
  exposure_values_c: number[];
  tmax_lag: number[];
  reference_temperature_c: number;
  odds_ratio: number;
  ci95_low: number;
  ci95_high: number;
  attributable_fraction_percent: number;
  relative_odds_change_percent: number;
  on_training_support: boolean;
  warning: string | null;
  n_model_rows: number | null;
  n_training: number | null;
  n_events: number | null;
  n_subjects: number | null;
  modelled_temperature_range_c: number[] | null;
  model_version: string;
  climate_hazard_label: string | null;
  health_domain_label: string | null;
  outcome_label: string | null;
  dashboard_title: string | null;
  population_label: string | null;
};

export async function submitWhatIfScore(
  accessToken: string,
  input: { geographyId: string; temperatureC: number; outcome?: string },
  init: { signal?: AbortSignal } = {},
) {
  return request<WhatIfScore>("/api/chart/climate/what-if", accessToken, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      geography_id: input.geographyId,
      temperature_c: input.temperatureC,
      outcome: input.outcome ?? "lbw",
    }),
    signal: init.signal,
  });
}

export async function submitPrediction(
  accessToken: string,
  input: {
    geographyId: string;
    planningMonth: string;
    target: PlanningTarget;
    scenario?: "ssp126" | "ssp370" | "ssp585";
    projectionPeriod?: "2031-2040";
  },
) {
  return request<PredictionAccepted | PredictionResult>(
    "/api/chart/climate/predict",
    accessToken,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        geography_id: input.geographyId,
        planning_date: `${input.planningMonth}-01`,
        outcome: "lbw",
        // The state-level MP model release validates window 1 only.
        // Divisions default to (1, 2, 3). Sending [1] keeps the state
        // default working; when the dashboard lets the user pick a
        // division and the API surfaces per-place validated windows,
        // send the largest available.
        pregnancy_windows: [1],
        planning_target: input.target,
        projection_scenario: input.scenario,
        projection_period: input.projectionPeriod,
      }),
    },
  );
}

export function predictionErrorMessage(code?: string | null) {
  switch (code) {
    case "LBW_SERVICE_NOT_CONFIGURED":
    case "LBW_SERVICE_TIMEOUT":
    case "LBW_SERVICE_UNAVAILABLE":
    case "LBW_PREDICT_FAILED":
      return "The model is temporarily unavailable. The climate data is saved, so this check can be tried again.";
    case "CLIMATE_DATA_NOT_READY":
    case "CLIMATE_INGEST_NOT_CONFIGURED":
      return "The three climate months could not be prepared.";
    case "CLIMATE_PROJECTION_SOURCE_UNAVAILABLE":
    case "ISIMIP_CUTOUT_TIMED_OUT":
    case "ISIMIP_CUTOUT_NOT_READY":
      return "The long-term climate source is temporarily unavailable.";
    case "MODEL_NOT_AVAILABLE_FOR_PLACE":
      return "No approved model is available for this area.";
    default:
      return code ?? "The planning check could not be completed.";
  }
}

async function request<T>(url: string, accessToken?: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);
  const response = await fetch(url, {
    // ``cache: "no-store"`` is the safe default for this client — most
    // endpoints (prediction status polling, what-if scoring, live
    // catalogs after a manifest change) must never come from a stale
    // browser cache. Callers that hit near-static reference endpoints
    // can override ``init.cache`` explicitly to opt into normal HTTP
    // caching. Note: process-level caches (see ``useGeographies``)
    // already dedupe within a session, so browser caching is mainly
    // useful across hard refreshes.
    cache: "no-store",
    ...init,
    headers,
    signal: init.signal ?? AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(predictionErrorMessage(body?.error));
  }
  return (await response.json()) as T;
}
