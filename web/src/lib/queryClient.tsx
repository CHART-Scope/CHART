"use client";

import {
  dehydrate,
  hydrate,
  QueryClient,
  QueryClientProvider,
  type Query,
} from "@tanstack/react-query";
import type { ReactNode } from "react";

import {
  getStoredAuthSession,
  onAuthSessionCleared,
  subscribeAuthSession,
} from "./authClient";

/**
 * The one client-side cache for API reads.
 *
 * Every read the app repeats - the place list, a model catalog, an outlook
 * view - is a query keyed by what it depends on. Revisiting a place, a month
 * or a Settings tab answers from memory at once and refreshes in the
 * background; switching to a new one keeps the previous answer on screen
 * (`placeholderData: keepPreviousData` at the call site) instead of blanking.
 *
 * Published reads are also kept in this tab's sessionStorage, so a reload
 * draws them at once instead of fetching everything again. Responses are
 * filtered by who is asking: the stored copy names its user and is dropped
 * for anyone else, and sign-out clears both.
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

const STORAGE_KEY = "chart.query-cache.v1";
/** Published reads only: never people, plans or anything administrative. */
const KEPT = new Set([
  "geographies",
  "model-catalog",
  "outlook-capabilities",
  "outlook-view",
]);

type Stored = { userId: string; state: ReturnType<typeof dehydrate> };

function readStored(): Stored | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

function forgetStored() {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: nothing was kept.
  }
}

function keep(client: QueryClient) {
  const userId = getStoredAuthSession()?.user.userId;
  if (!userId) return;
  const state = dehydrate(client, {
    shouldDehydrateQuery: (query: Query) =>
      query.state.status === "success" && KEPT.has(String(query.queryKey[0])),
  });
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ userId, state }));
  } catch {
    // Full or blocked: the in-memory cache still serves this visit.
  }
}

function persist(client: QueryClient) {
  const stored = readStored();
  // Before the session is restored the user is not known yet; the copy is
  // drawn now and dropped below if the session turns out to be someone else's.
  if (stored) {
    hydrate(client, stored.state);
    // Drawn at once, then refreshed behind the page: a reload still shows
    // anything that changed meanwhile (a release, a setting saved elsewhere).
    void client.invalidateQueries({ refetchType: "none" });
  }

  const check = () => {
    const userId = getStoredAuthSession()?.user.userId;
    if (userId && stored && stored.userId !== userId) {
      client.clear();
      forgetStored();
    }
  };
  check();
  subscribeAuthSession(check);
  onAuthSessionCleared(() => {
    client.clear();
    forgetStored();
  });

  let timer: ReturnType<typeof setTimeout> | null = null;
  client.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" && event.type !== "removed") return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => keep(client), 400);
  });
}

let browserClient: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  // A server render gets a throwaway client so one visitor's cache can never
  // reach another's; the browser keeps one for the life of the tab.
  if (typeof window === "undefined") return createQueryClient();
  if (!browserClient) {
    browserClient = createQueryClient();
    persist(browserClient);
  }
  return browserClient;
}

export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>
  );
}
