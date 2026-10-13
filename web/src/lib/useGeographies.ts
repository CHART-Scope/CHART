"use client";

import { useEffect, useState } from "react";

import { onAuthSessionCleared } from "@/lib/authClient";
import { listGeographies, type GeographyRecord } from "@/lib/planningClient";

/**
 * Shared client-side cache of the /geographies response. Every
 * component that needs the list (DashboardContextBar,
 * InlineContextSwitcher, GeographyContextCard, PlanningApp, the
 * dashboard page) should call this hook instead of firing its own
 * ``listGeographies()`` — otherwise a single dashboard mount issues
 * five identical concurrent HTTPS round-trips for the same JSON.
 *
 * The cache is process-scoped (one entry, latest snapshot) and
 * populated by the first caller's ``listGeographies()``. Subsequent
 * subscribers on the same page reuse the promise while it's in flight
 * and the resolved list once it lands. ``refresh()`` (returned) is a
 * manual invalidation hook for callers that just committed a change
 * (e.g. finishing setup, an admin bootstrap step) and want the next
 * ``useGeographies()`` render to observe the new list.
 */

let cache: GeographyRecord[] | null = null;
let inFlight: Promise<GeographyRecord[]> | null = null;
const subscribers = new Set<(records: GeographyRecord[]) => void>();

// The list is filtered by who is asking; the next user must not see it.
onAuthSessionCleared(() => {
  cache = null;
  inFlight = null;
});

function fetchOnce(): Promise<GeographyRecord[]> {
  if (cache) return Promise.resolve(cache);
  if (inFlight) return inFlight;
  const request: Promise<GeographyRecord[]> = listGeographies()
    .then((records) => {
      // Cleared by a sign-out meanwhile: answer this caller, cache nothing.
      if (inFlight !== request) return records;
      cache = records;
      inFlight = null;
      for (const subscriber of subscribers) subscriber(records);
      return records;
    })
    .catch((error) => {
      if (inFlight === request) inFlight = null;
      throw error;
    });
  inFlight = request;
  return request;
}

export type UseGeographies = {
  geographies: GeographyRecord[] | null;
  error: Error | null;
  refresh: () => Promise<void>;
};

export function useGeographies(): UseGeographies {
  const [state, setState] = useState<{
    geographies: GeographyRecord[] | null;
    error: Error | null;
  }>(() => ({ geographies: cache, error: null }));

  useEffect(() => {
    let cancelled = false;
    const notify = (records: GeographyRecord[]) => {
      if (!cancelled) setState({ geographies: records, error: null });
    };
    subscribers.add(notify);
    if (!cache) {
      fetchOnce().catch((error: unknown) => {
        if (cancelled) return;
        setState({
          geographies: null,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      });
    }
    return () => {
      cancelled = true;
      subscribers.delete(notify);
    };
  }, []);

  return {
    geographies: state.geographies,
    error: state.error,
    async refresh() {
      cache = null;
      inFlight = null;
      const records = await fetchOnce();
      setState({ geographies: records, error: null });
    },
  };
}

/** Test-only: clear the module-scoped cache so a fresh mount will
 * re-fetch. Not exported through a barrel — call directly in tests. */
export function _resetGeographiesCache(): void {
  cache = null;
  inFlight = null;
  subscribers.clear();
}
