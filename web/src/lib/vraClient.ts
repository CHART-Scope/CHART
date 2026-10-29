/**
 * Typed client for the vulnerability and resilience assessment (VRA) API.
 *
 * An assessment always compares the child areas of one "frame" place (a
 * state's divisions, a country's counties), so every call but the catalogue
 * is keyed by the frame's geography id. Readers share the risk map's roles
 * and scope check; coverage, the template, uploads and runs are admin only.
 *
 * Scores are 0-1 and relative within the frame. Indicator `normalised`
 * scores are already oriented so that higher means more risk; the
 * `adaptive_capacity` component is capacity (higher = better), which the UI
 * shows as its lack (see `features/vulnerability/vraScale.ts`).
 */

import { authFetch, readErrorCode } from "./authFetch";
import type { MapResponse } from "./dashboardClient";

export type VraComponent = "hazard" | "exposure" | "sensitivity" | "adaptive_capacity";
export type VraRoute = "computed" | "upload" | "manual" | "pull";
export type VraStatus = "included" | "context" | "dropped";
export type VraRiskClass = "low" | "moderate" | "high" | "very_high";

export type VraValueSchema = {
  type: "number" | "integer" | "binary";
  minimum: number | null;
  maximum: number | null;
  example: number;
  expected_values: string;
};

export type VraIndicator = {
  code: string;
  component: VraComponent;
  category: string;
  name: string;
  unit: string;
  direction_to_risk: 1 | -1;
  route: VraRoute;
  status: VraStatus;
  rationale: string;
  uploadable?: boolean;
  value_schema?: VraValueSchema;
};

export type VraRun = {
  id: number;
  created_at: string;
  method_version: string;
  weights: string;
  area_count: number;
  indicator_count: number;
  class_breaks: number[];
};

export type VraDriver = {
  code: string;
  name: string;
  component: VraComponent;
  normalised: number;
};

export type VraArea = {
  geography_id: string | null;
  admin_unit_id: number;
  code: string;
  name: string;
  risk: number | null;
  risk_class: VraRiskClass | null;
  rank: number | null;
  components: Record<VraComponent | "vulnerability", number | null>;
  coverage: Record<VraComponent, number | null>;
  drivers: VraDriver[];
  missing_reason: string | null;
};

export type VraAssessment = {
  geography_id: string;
  name: string;
  area_level_label: string | null;
  run: VraRun | null;
  areas: VraArea[];
};

export type VraIndicatorValue = {
  code: string;
  name: string;
  component: VraComponent;
  unit: string;
  direction_to_risk: 1 | -1;
  raw: number | null;
  vintage: string | null;
  normalised: number | null;
  weight: number | null;
  contribution: number | null;
  method: string | null;
  source_name: string | null;
  source_url: string | null;
  /** Provenance notes keyed by name; a `true` value is a caveat worth a badge
   * (e.g. `apportioned`, `state_level`), anything else is detail. */
  quality_flags: Record<string, unknown>;
  excluded_reason: string | null;
};

export type VraAreaDetail = { area: VraArea; indicators: VraIndicatorValue[] };

export type VraRejection = { row: number; reason: string };

export type VraIngestion = {
  id: number;
  status: "completed" | "failed";
  file_name: string | null;
  rows_accepted: number;
  rows_rejected: number;
  rejections: VraRejection[];
  created_at: string;
  requested_by: string | null;
};

export type VraCoverageIndicator = {
  code: string;
  name: string;
  component: VraComponent;
  route: VraRoute;
  status: VraStatus;
  present: number;
  vintages: string[];
  updated_at: string | null;
  unit?: string;
  uploadable?: boolean;
  value_schema?: VraValueSchema;
};

export type VraCoverage = {
  area_count: number;
  indicators: VraCoverageIndicator[];
  ingestions: VraIngestion[];
};

export type VraUploadResult = {
  ingestion_id: number;
  status: "completed" | "failed";
  rows_accepted: number;
  rows_rejected: number;
  rejections: VraRejection[];
};

/** A refused or failed call, with the API's stable error code when it sent one. */
export class VraRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    message?: string,
  ) {
    super(message ?? vraErrorMessage(status, code));
  }
}

const MESSAGES: Record<string, string> = {
  GEOGRAPHY_OUT_OF_SCOPE: "This place is outside your planning area.",
  GEOGRAPHY_NOT_FOUND: "This place could not be found.",
  CHART_API_UNAVAILABLE: "The CHART service is not reachable right now.",
  VRA_AREA_NOT_FOUND: "This area is not part of the assessment.",
  VRA_CSV_HEADER_INVALID:
    "The file's columns do not match the template. Download the template and fill that in.",
  VRA_CSV_NOT_UTF8: "The file is not UTF-8 text. Save it as CSV (UTF-8) and try again.",
  VRA_CSV_INVALID:
    "The CSV could not be read. Check its quoting and upload it again; no values were saved.",
  VRA_UPLOAD_TOO_LARGE: "The file is too large. Split it and upload the parts.",
  VRA_TEMPLATE_INDICATOR_INVALID:
    "This indicator cannot be uploaded. Choose an indicator from the template list.",
};

export function vraErrorMessage(status: number, code: string | null): string {
  if (code && MESSAGES[code]) return MESSAGES[code];
  if (status === 403) return "Your account may not do this.";
  if (status === 404) return "Nothing is available for this place.";
  return `The assessment service failed${code ? ` (${code})` : ""}.`;
}

const base = (geographyId: string) =>
  `/api/chart/vra/${encodeURIComponent(geographyId)}`;

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw await requestError(response);
  return (await response.json()) as T;
}

async function requestError(response: Response): Promise<VraRequestError> {
  const body = (await response
    .clone()
    .json()
    .catch(() => null)) as {
    message?: unknown;
  } | null;
  return new VraRequestError(
    response.status,
    await readErrorCode(response),
    typeof body?.message === "string" ? body.message : undefined,
  );
}

type Options = { signal?: AbortSignal };

export async function listVraIndicators(
  accessToken: string | null | undefined,
  options: Options = {},
): Promise<VraIndicator[]> {
  const response = await authFetch("/api/chart/vra/indicators", {
    accessToken,
    signal: options.signal,
  });
  return (await readJson<{ items: VraIndicator[] }>(response)).items;
}

export async function fetchVraAssessment(
  geographyId: string,
  accessToken: string | null | undefined,
  options: Options = {},
): Promise<VraAssessment> {
  const response = await authFetch(`${base(geographyId)}/assessment`, {
    accessToken,
    signal: options.signal,
  });
  return readJson<VraAssessment>(response);
}

/** The frame's areas in the risk map's shape; `value_percent` is risk × 100. */
export async function fetchVraMap(
  geographyId: string,
  accessToken: string | null | undefined,
  options: Options = {},
): Promise<MapResponse> {
  const response = await authFetch(`${base(geographyId)}/map`, {
    accessToken,
    signal: options.signal,
  });
  return readJson<MapResponse>(response);
}

export async function fetchVraArea(
  geographyId: string,
  areaGeographyId: string,
  accessToken: string | null | undefined,
  options: Options = {},
): Promise<VraAreaDetail> {
  const response = await authFetch(
    `${base(geographyId)}/areas/${encodeURIComponent(areaGeographyId)}`,
    { accessToken, signal: options.signal },
  );
  return readJson<VraAreaDetail>(response);
}

export async function fetchVraCoverage(
  geographyId: string,
  accessToken: string | null | undefined,
  options: Options = {},
): Promise<VraCoverage> {
  const response = await authFetch(`${base(geographyId)}/coverage`, {
    accessToken,
    signal: options.signal,
  });
  return readJson<VraCoverage>(response);
}

/** The upload template as CSV text: one row per child area × uploadable indicator. */
export async function fetchVraTemplate(
  geographyId: string,
  accessToken: string | null | undefined,
  indicatorCode?: string,
): Promise<string> {
  const query = indicatorCode
    ? `?${new URLSearchParams({ indicator_code: indicatorCode })}`
    : "";
  const response = await authFetch(`${base(geographyId)}/template.csv${query}`, {
    accessToken,
  });
  if (!response.ok) throw await requestError(response);
  return response.text();
}

/** Send a filled template. Row-level problems come back as rejections, not errors. */
export async function uploadVraValues(
  geographyId: string,
  accessToken: string | null | undefined,
  csv: string,
  fileName: string,
  indicatorCode?: string,
): Promise<VraUploadResult> {
  const query = new URLSearchParams({ file_name: fileName });
  if (indicatorCode) query.set("indicator_code", indicatorCode);
  const response = await authFetch(`${base(geographyId)}/values?${query}`, {
    method: "POST",
    accessToken,
    headers: { "content-type": "text/csv" },
    body: csv,
  });
  return readJson<VraUploadResult>(response);
}

/** Score the frame now (synchronous) and return the new assessment. */
export async function runVraAssessment(
  geographyId: string,
  accessToken: string | null | undefined,
): Promise<VraAssessment> {
  const response = await authFetch(`${base(geographyId)}/runs`, {
    method: "POST",
    accessToken,
    timeoutMs: 120_000,
  });
  return readJson<VraAssessment>(response);
}
