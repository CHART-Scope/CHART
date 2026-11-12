"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { listGeographies, type GeographyRecord } from "@/lib/planningClient";

/**
 * The /geographies list, read once per session from the shared query cache
 * (see queryClient.tsx). Every component that needs places calls this rather
 * than `listGeographies()`, so a page with five consumers sends one request,
 * and a later page answers from memory.
 */
export const geographiesQueryKey = ["geographies"] as const;

export type UseGeographies = {
  geographies: GeographyRecord[] | null;
  error: Error | null;
  /** Re-read after a change that adds or removes places (setup, admin). */
  refresh: () => Promise<void>;
};

export function useGeographies(): UseGeographies {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: geographiesQueryKey,
    queryFn: () => listGeographies(),
    // Places change only when an administrator registers one.
    staleTime: 30 * 60_000,
  });
  return {
    geographies: query.data ?? null,
    error: query.error,
    refresh: () => queryClient.invalidateQueries({ queryKey: geographiesQueryKey }),
  };
}
