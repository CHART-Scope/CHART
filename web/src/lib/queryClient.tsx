"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { onAuthSessionCleared } from "./authClient";

/**
 * The one client-side cache for API reads.
 *
 * Every read the app repeats - the place list, a model catalog, an outlook
 * view - is a query keyed by what it depends on. Revisiting a place, a month
 * or a Settings tab answers from memory at once and refreshes in the
 * background; switching to a new one keeps the previous answer on screen
 * (`placeholderData: keepPreviousData` at the call site) instead of blanking.
 *
 * Responses are filtered by who is asking, so sign-out drops everything.
 */
function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Published estimates change on a modeller's release, not per click.
        staleTime: 5 * 60_000,
        gcTime: 30 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}

let browserClient: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  // A server render gets a throwaway client so one visitor's cache can never
  // reach another's; the browser keeps one for the life of the tab.
  if (typeof window === "undefined") return createQueryClient();
  if (!browserClient) {
    browserClient = createQueryClient();
    onAuthSessionCleared(() => browserClient?.clear());
  }
  return browserClient;
}

export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>
  );
}
