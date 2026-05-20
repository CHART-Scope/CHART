import type { SourceMetadata, SourceSyncResult } from "./types.js";

const sources: SourceMetadata[] = [
  {
    id: "climate-era5",
    kind: "climate",
    name: "ERA5 climate data",
    provider: "Copernicus",
    refreshMode: "sync"
  },
  {
    id: "health-seed",
    kind: "health",
    name: "Seed health indicators",
    provider: "CHART",
    refreshMode: "seed"
  },
  {
    id: "population-seed",
    kind: "population",
    name: "Seed population indicators",
    provider: "CHART",
    refreshMode: "seed"
  },
  {
    id: "geography-seed",
    kind: "geography",
    name: "Seed geography scopes",
    provider: "CHART",
    refreshMode: "seed"
  },
  {
    id: "solutions-seed",
    kind: "solutions",
    name: "Seed solution repository",
    provider: "CHART",
    refreshMode: "seed"
  }
];

export function listSources(): SourceMetadata[] {
  return sources;
}

export function getSourceById(sourceId: string): SourceMetadata | undefined {
  return sources.find((source) => source.id === sourceId);
}

export function queueSourceSync(sourceId: string): SourceSyncResult {
  return {
    sourceId,
    status: "queued"
  };
}
