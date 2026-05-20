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
