import { useCallback, useEffect, useRef, useState } from "react";

import { startPolling } from "@/lib/polling";

/** Empty-state re-polls before the view waits for an explicit "Check now". */
const MAX_EMPTY_POLLS = 60;

type FetchState<T> =
  | { status: "idle" }
  | { status: "loading"; retryCount: number }
  | { status: "ready"; data: T }
  | { status: "empty"; retryCount: number }
  | { status: "error"; message: string; retryCount: number };

type Options<T> = {
  fetcher: () => Promise<T>;
  isEmpty: (payload: T) => boolean;
  /** Milliseconds between empty-state re-polls; 0 disables auto-poll. */
  pollIntervalMs?: number;
  /**
   * When this changes, the hook re-fetches immediately without waiting for
   * the empty-state poll. Use it to nudge the view after a prediction has
   * just completed.
   */
  refreshKey?: string | null;
};

/**
 * Encapsulates the "load precomputed dashboard payload, retry while a
 * Dagster job is preparing it" pattern.
 *
 * Loading is optimistic: we show the loading state on first call and on
 * every explicit retry, but *not* on the silent poll for an empty view,
 * so the panel does not flash on every tick.
 */
export function useHorizonView<T>({
  fetcher,
  isEmpty,
  pollIntervalMs = 0,
  refreshKey = null,
}: Options<T>) {
  const [state, setState] = useState<FetchState<T>>({ status: "idle" });
  // Callers routinely pass inline arrow-function isEmpty predicates. If we
  // let the predicate flow into `load`'s dep array, `load` becomes a new
  // reference on every render, the effect below re-fires, setState runs,
  // and we're in an infinite loop. Reading from a ref keeps `load` stable
  // across renders and callers do not have to remember to memoize.
  const isEmptyRef = useRef(isEmpty);
  const pollIntervalMsRef = useRef(pollIntervalMs);
  isEmptyRef.current = isEmpty;
  pollIntervalMsRef.current = pollIntervalMs;

  const load = useCallback(
    async (options: { silent?: boolean; retryCount?: number } = {}) => {
      const retryCount = options.retryCount ?? 0;
      if (!options.silent) {
        setState({ status: "loading", retryCount });
      }
      try {
        const data = await fetcher();
        if (isEmptyRef.current(data)) {
          setState({ status: "empty", retryCount });
        } else {
          setState({ status: "ready", data });
        }
      } catch (error) {
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Load failed.",
          retryCount,
        });
      }
    },
    [fetcher],
  );

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  // Re-poll while the payload is empty: capped, one request at a time, and
  // paused while the tab is hidden. Keyed on the status rather than the
  // whole state so each silent re-poll does not restart the poller.
  const isEmptyState = state.status === "empty";
  useEffect(() => {
    const interval = pollIntervalMsRef.current;
    if (interval <= 0 || !isEmptyState) return;
    return startPolling({
      intervalMs: interval,
      maxAttempts: MAX_EMPTY_POLLS,
      tick: async (_signal, attempt) => {
        await load({ silent: true, retryCount: attempt });
        return "continue";
      },
    });
  }, [load, isEmptyState]);

  const retry = useCallback(() => {
    const nextRetry =
      state.status === "empty" || state.status === "error" || state.status === "loading"
        ? state.retryCount + 1
        : 0;
    void load({ retryCount: nextRetry });
  }, [load, state]);

  return { state, retry } as const;
}
