import { useCallback, useEffect, useRef, useState } from "react";

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
}: Options<T>) {
  const [state, setState] = useState<FetchState<T>>({ status: "idle" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    async (options: { silent?: boolean; retryCount?: number } = {}) => {
      const retryCount = options.retryCount ?? 0;
      if (!options.silent) {
        setState({ status: "loading", retryCount });
      }
      try {
        const data = await fetcher();
        if (isEmpty(data)) {
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
    [fetcher, isEmpty],
  );

  useEffect(() => {
    void load();
    return () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [load]);

  useEffect(() => {
    if (pollIntervalMs <= 0) return;
    if (state.status !== "empty") return;
    timer.current = setTimeout(() => {
      void load({ silent: true, retryCount: state.retryCount + 1 });
    }, pollIntervalMs);
    return () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [load, pollIntervalMs, state]);

  const retry = useCallback(() => {
    const nextRetry =
      state.status === "empty" || state.status === "error" || state.status === "loading"
        ? state.retryCount + 1
        : 0;
    void load({ retryCount: nextRetry });
  }, [load, state]);

  return { state, retry } as const;
}
