export type SourceKind =
  | "climate"
  | "health"
  | "population"
  | "geography"
  | "solutions";

export interface SourceMetadata {
  id: string;
  kind: SourceKind;
  name: string;
  provider: string;
  refreshMode: "seed" | "sync" | "external";
  configurationStatus?: "configured" | "missing_configuration";
  lastUpdatedAt?: string;
}

export interface SourceSyncResult {
  sourceId: string;
  status: "queued";
}

export type Dhis2AuthMode = "pat" | "basic" | "oauth2";

export interface Dhis2PublicConfig {
  sourceId: "health-dhis2";
  baseUrl?: string;
  apiVersion: string;
  authMode: Dhis2AuthMode;
  credentialConfigured: boolean;
  configured: boolean;
  meUrl?: string;
}

export interface Dhis2ConnectionTestResult {
  sourceId: "health-dhis2";
  status: "connected" | "missing_configuration" | "failed";
  meUrl?: string;
  httpStatus?: number;
  username?: string;
  message?: string;
}

export const sourceMetadataSchema = {
  type: "object",
  required: ["id", "kind", "name", "provider", "refreshMode"],
  properties: {
    id: { type: "string" },
    kind: {
      type: "string",
      enum: ["climate", "health", "population", "geography", "solutions"],
    },
    name: { type: "string" },
    provider: { type: "string" },
    refreshMode: { type: "string", enum: ["seed", "sync", "external"] },
    configurationStatus: {
      type: "string",
      enum: ["configured", "missing_configuration"],
    },
    lastUpdatedAt: { type: "string" },
  },
} as const;

export const sourceSyncResultSchema = {
  type: "object",
  required: ["sourceId", "status"],
  properties: {
    sourceId: { type: "string" },
    status: { type: "string", enum: ["queued"] },
  },
} as const;

export const dhis2PublicConfigSchema = {
  type: "object",
  required: [
    "sourceId",
    "apiVersion",
    "authMode",
    "credentialConfigured",
    "configured",
  ],
  properties: {
    sourceId: { type: "string", enum: ["health-dhis2"] },
    baseUrl: { type: "string" },
    apiVersion: { type: "string" },
    authMode: { type: "string", enum: ["pat", "basic", "oauth2"] },
    credentialConfigured: { type: "boolean" },
    configured: { type: "boolean" },
    meUrl: { type: "string" },
  },
} as const;

export const dhis2ConnectionTestResultSchema = {
  type: "object",
  required: ["sourceId", "status"],
  properties: {
    sourceId: { type: "string", enum: ["health-dhis2"] },
    status: {
      type: "string",
      enum: ["connected", "missing_configuration", "failed"],
    },
    meUrl: { type: "string" },
    httpStatus: { type: "number" },
    username: { type: "string" },
    message: { type: "string" },
  },
} as const;

export const sourceIdParamsSchema = {
  type: "object",
  required: ["sourceId"],
  properties: {
    sourceId: { type: "string" },
  },
} as const;

export const errorResponseSchema = {
  type: "object",
  required: ["error"],
  properties: {
    error: { type: "string" },
  },
} as const;
