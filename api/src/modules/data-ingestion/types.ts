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
  lastUpdatedAt?: string;
}

export interface SourceSyncResult {
  sourceId: string;
  status: "queued";
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
