"use client";

import { useEffect, useState } from "react";

import { listModelCatalog, type ModelCatalogEntry } from "@/lib/planningClient";

/**
 * Shared client-side cache of `/model-catalog`, keyed by geography, in the
 * same spirit as `useGeographies`: several parts of a single page need the
 * same catalog (the dashboard panels, the context bar, the sidebar's planning
 * context) and each one firing its own identical round-trip is what made the
 * geography list slow enough to need a cache in the first place.
 *
 * Always requests `include_descendants`, because that is the shape the
 * dashboard asks for; a second variant would defeat the cache without adding
 * anything a caller currently wants.
 */

const cache = new Map<string, ModelCatalogEntry[]>();
const inFlight = new Map<string, Promise<ModelCatalogEntry[]>>();

function fetchOnce(geographyId: string): Promise<ModelCatalogEntry[]> {
  const cached = cache.get(geographyId);
  if (cached) return Promise.resolve(cached);
  const pending = inFlight.get(geographyId);
  if (pending) return pending;
  const request = listModelCatalog(geographyId, { includeDescendants: true })
    .then((items) => {
      cache.set(geographyId, items);
      inFlight.delete(geographyId);
      return items;
    })
    .catch((error: unknown) => {
      inFlight.delete(geographyId);
      throw error;
    });
  inFlight.set(geographyId, request);
  return request;
}

export type UseModelCatalog = {
  /** `null` while the request is in flight; `[]` once it has failed, so a
   * caller can tell "still waiting" from "nothing to show". */
  catalog: ModelCatalogEntry[] | null;
  error: Error | null;
};

export function useModelCatalog(geographyId: string | null): UseModelCatalog {
  const [state, setState] = useState<UseModelCatalog>(() =>
    geographyId
      ? { catalog: cache.get(geographyId) ?? null, error: null }
      : { catalog: [], error: null },
  );

  useEffect(() => {
    if (!geographyId) {
      setState({ catalog: [], error: null });
      return;
    }
    const cached = cache.get(geographyId);
    if (cached) {
      setState({ catalog: cached, error: null });
      return;
    }
    let cancelled = false;
    setState({ catalog: null, error: null });
    fetchOnce(geographyId)
      .then((items) => {
        if (!cancelled) setState({ catalog: items, error: null });
      })
      .catch((error: unknown) => {
        // An empty catalog rather than a permanent spinner: a missing catalog
        // costs the caller a label, it must not cost them the whole panel.
        if (!cancelled) {
          setState({
            catalog: [],
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [geographyId]);

  return state;
}

/** Test-only: drop the module-scoped cache so the next mount re-fetches. */
export function _resetModelCatalogCache(): void {
  cache.clear();
  inFlight.clear();
}
