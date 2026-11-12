"use client";

import { useQuery } from "@tanstack/react-query";

import { listModelCatalog, type ModelCatalogEntry } from "@/lib/planningClient";

/**
 * `/model-catalog` for a geography, from the shared query cache. Always
 * requests `include_descendants`, the shape the dashboard asks for; a second
 * variant would split the cache without adding anything a caller wants.
 */
export type UseModelCatalog = {
  /** `null` while the request is in flight; `[]` once it has failed, so a
   * caller can tell "still waiting" from "nothing to show". */
  catalog: ModelCatalogEntry[] | null;
  error: Error | null;
};

export function useModelCatalog(geographyId: string | null): UseModelCatalog {
  const query = useQuery({
    queryKey: ["model-catalog", geographyId],
    queryFn: () => listModelCatalog(geographyId!, { includeDescendants: true }),
    enabled: geographyId !== null,
    staleTime: 30 * 60_000,
  });
  if (!geographyId) return { catalog: [], error: null };
  // A missing catalog costs the caller a label; it must not cost them the
  // whole panel, so a failure reads as empty rather than loading forever.
  if (query.error) return { catalog: [], error: query.error };
  return { catalog: query.data ?? null, error: null };
}
