export type PredictionStatus =
  | "waiting"
  | "queued"
  | "running"
  | "completed"
  | "failed";

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
  data_label: string | null;
  quality_status: string | null;
  climate_run_id: number | null;
  raw_file_uri: string | null;
  raw_file_hash: string | null;
  scenario: string | null;
  projection_period: string | null;
  ensemble_summary: string | null;
  expected_source_class: string | null;
  expected_source_name: string;
  source_policy_version: string;
  unavailable_reason: string | null;
};

export type PlanningTarget =
  | "month"
  | "next_three_months"
  | "next_heat_season"
  | "long_term_hot_season";

export type LbwPrediction = {
  area: string;
  geography_level: string;
  pregnancy_window: number;
  temperatures_c: number[];
  reference_temperature_c: number;
  odds_ratio: number;
  ci95_low: number;
  ci95_high: number;
  on_training_support: boolean;
  model_file: string;
  model_version: string;
  warning: string | null;
  explanation: string | null;
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

export type PredictionAccepted = {
  request_id: number;
  status: "waiting" | "queued" | "running";
  stage: PredictionStage;
  geography_id: string;
  planning_date: string;
  source_as_of: string | null;
  status_url: string;
  message: string;
  available_from: string | null;
  planning_target: PlanningTarget;
  projection_scenario: "ssp126" | "ssp370" | "ssp585" | null;
  projection_period: "2031-2040" | null;
};

export type PredictionRequestStatus = {
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

export type PredictionRequestSummary = {
  request_id: number;
  status: PredictionStatus;
  stage: PredictionStage;
  geography_id: string;
  planning_date: string;
  source_as_of: string | null;
  error_code: string | null;
  created_at: string;
  updated_at: string;
  available_from: string | null;
  planning_target: PlanningTarget;
  projection_scenario: "ssp126" | "ssp370" | "ssp585" | null;
  projection_period: "2031-2040" | null;
  odds_ratio: number | null;
};

export type PredictionRequestList = {
  items: PredictionRequestSummary[];
};

export type PlanningOptions = {
  geography_id: string;
  source_as_of: string;
  validated_pregnancy_windows: (1 | 2 | 3)[];
  model_result_mode: "single_association" | "pregnancy_windows";
  custom_min_month: string;
  custom_max_month: string;
  next_three_months: {
    label: string;
    months: string[];
    planning_date: string;
    available: boolean;
    available_from: string | null;
    unavailable_reason: string | null;
    source_name: string;
    source_uri: string;
  };
  next_heat_season: {
    label: string;
    months: string[];
    planning_date: string;
    available: boolean;
    available_from: string | null;
    unavailable_reason: string | null;
    source_name: string;
    source_uri: string;
  } | null;
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
    source_name: string;
    source_uri: string;
  } | null;
};

export async function getPlanningOptions(geographyId: string, accessToken?: string) {
  const response = await fetch(
    `/api/chart/climate/planning-options/${encodeURIComponent(geographyId)}`,
    {
      cache: "no-store",
      headers: authHeaders(accessToken),
    },
  );

  if (!response.ok) {
    throw new Error(await readPredictionError(response));
  }

  return (await response.json()) as PlanningOptions;
}

export async function submitLbwPrediction(
  geographyId: string,
  planningMonth: string,
  accessToken?: string,
  selection?: {
    target: PlanningTarget;
    pregnancyWindows: (1 | 2 | 3)[];
    projection?: {
      scenario: "ssp126" | "ssp370" | "ssp585";
      period: "2031-2040";
    };
  },
) {
  const projection = selection?.projection;
  const response = await fetch("/api/chart/climate/predict", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authHeaders(accessToken),
    },
    body: JSON.stringify({
      geography_id: geographyId,
      planning_date: `${planningMonth}-01`,
      outcome: "lbw",
      pregnancy_windows: selection?.pregnancyWindows ?? [1],
      planning_target: selection?.target ?? "month",
      projection_scenario: projection?.scenario,
      projection_period: projection?.period,
    }),
  });

  if (!response.ok) {
    throw new Error(await readPredictionError(response));
  }

  return (await response.json()) as PredictionAccepted | PredictionResult;
}

export async function getPredictionRequest(requestId: number, accessToken?: string) {
  const response = await fetch(`/api/chart/climate/prediction-requests/${requestId}`, {
    cache: "no-store",
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    throw new Error(await readPredictionError(response));
  }

  return (await response.json()) as PredictionRequestStatus;
}

export async function listPredictionRequests(
  geographyId: string,
  accessToken?: string,
) {
  const query = new URLSearchParams({ geography_id: geographyId, limit: "10" });
  const response = await fetch(`/api/chart/climate/prediction-requests?${query}`, {
    cache: "no-store",
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    throw new Error(await readPredictionError(response));
  }

  return (await response.json()) as PredictionRequestList;
}

function authHeaders(accessToken?: string): Record<string, string> {
  return accessToken ? { authorization: `Bearer ${accessToken}` } : {};
}

async function readPredictionError(response: Response) {
  try {
    const body = (await response.json()) as { error?: string };
    return predictionErrorMessage(body.error);
  } catch {
    return "The prediction service is unavailable.";
  }
}

export function predictionErrorMessage(errorCode?: string | null) {
  switch (errorCode) {
    case "AUTH_TOKEN_REQUIRED":
      return "Sign in again to run a prediction.";
    case "AUTH_TOKEN_INVALID":
      return "Your sign-in expired. CHART will ask you to sign in again.";
    case "CLIMATE_INGEST_NOT_CONFIGURED":
      return "Climate downloads are not configured on this deployment.";
    case "CLIMATE_DATA_NOT_READY":
      return "The three climate months could not be prepared.";
    case "CLIMATE_HORIZON_NOT_AVAILABLE":
    case "CLIMATE_LONG_TERM_SCENARIO_REQUIRED":
      return "That planning date is beyond the available seasonal forecast. A long-term scenario has not been enabled yet.";
    case "CLIMATE_PROJECTION_SOURCE_UNAVAILABLE":
    case "ISIMIP_CUTOUT_TIMED_OUT":
    case "ISIMIP_CUTOUT_NOT_READY":
      return "The long-term climate source is temporarily unavailable. Nothing else was substituted; try again later.";
    case "MODEL_NOT_AVAILABLE_FOR_PLACE":
      return "No active prediction model is mapped to this area yet.";
    case "MODEL_PREGNANCY_WINDOW_NOT_VALIDATED":
      return "That model result has not been validated for this area.";
    case "LBW_SERVICE_NOT_CONFIGURED":
      return "The prediction model is not configured on this deployment.";
    case "LBW_SERVICE_TIMEOUT":
    case "LBW_SERVICE_UNAVAILABLE":
    case "LBW_PREDICT_FAILED":
      return "The prediction model is temporarily unavailable. Your climate data is saved; try this estimate again.";
    case "PREDICTION_REQUEST_NOT_FOUND":
      return "This prediction request could not be found.";
    default:
      return errorCode ?? "The prediction could not be completed.";
  }
}
