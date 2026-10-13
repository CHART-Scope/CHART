import { authFetch } from "@/lib/authFetch";

/**
 * Typed client for per-country model settings.
 *
 * `/api/chart/:path*` already rewrites to the Python API, which validates
 * and applies the settings; the browser only reads them and sends a change.
 */

export type SettingView = "outlook" | "live";

export type SettingOption = { code: string; label: string; views: SettingView[] };

export type ModelSettingsValues = {
  selectors: string[];
  default_selector: string | null;
  scenarios: string[];
  default_scenario: string | null;
  data_modes: string[];
};

export type ModelSettings = {
  country_code: string;
  country_name: string;
  outcome: string;
  available: {
    selector_label: string;
    selectors: SettingOption[];
    scenarios: SettingOption[];
    data_modes: SettingOption[];
  };
  settings: ModelSettingsValues;
  is_default: boolean;
  updated_by_user_id: string | null;
  updated_at: string | null;
};

const ERROR_MESSAGES: Record<string, string> = {
  MODEL_SETTINGS_OPTION_REQUIRED:
    "Keep at least one option switched on in each list for every view.",
  MODEL_SETTINGS_DEFAULT_NOT_ENABLED: "Choose a default that is switched on.",
  MODEL_SETTINGS_DEFAULT_REQUIRED: "Choose a default that is switched on.",
  MODEL_SETTINGS_OPTION_UNKNOWN:
    "One of these options is no longer offered by the model. Reload and try again.",
  GEOGRAPHY_OUT_OF_SCOPE: "You do not have access to this country.",
};

async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return (body.error && ERROR_MESSAGES[body.error]) ?? fallback;
  } catch {
    return fallback;
  }
}

export async function fetchModelSettings(
  accessToken: string,
  signal?: AbortSignal,
): Promise<ModelSettings[]> {
  const response = await authFetch("/api/chart/model-settings", {
    cache: "no-store",
    accessToken,
    signal,
  });
  if (!response.ok)
    throw new Error(await errorMessage(response, "The model settings could not load."));
  return ((await response.json()) as { items: ModelSettings[] }).items;
}

export async function saveModelSettings(
  accessToken: string,
  countryCode: string,
  outcome: string,
  values: ModelSettingsValues,
): Promise<ModelSettings> {
  const response = await authFetch(
    `/api/chart/model-settings/${encodeURIComponent(countryCode)}/${encodeURIComponent(outcome)}`,
    {
      method: "PUT",
      cache: "no-store",
      accessToken,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    },
  );
  if (!response.ok)
    throw new Error(await errorMessage(response, "The settings could not be saved."));
  return (await response.json()) as ModelSettings;
}
