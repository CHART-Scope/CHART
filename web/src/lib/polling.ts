export type PollResult = "continue" | "stop";

export type PollOptions = {
  /** One check. Resolve "stop" when the work is done or has failed. */
  tick: (signal: AbortSignal, attempt: number) => Promise<PollResult>;
  intervalMs: number;
  /** Checks before giving up; `onExhausted` runs instead of the next one. */
  maxAttempts: number;
  onExhausted?: () => void;
  /** Run the first check now rather than after one interval. */
  immediate?: boolean;
  signal?: AbortSignal;
};

/**
 * Poll without the usual leaks: one check in flight at a time (the next is
 * scheduled only once the last settles), a hard attempt cap, an abort signal
 * every check receives, and no requests at all while the tab is hidden - a
 * due check waits for the tab to be shown again and then runs at once.
 *
 * Returns a stop function. A tick that throws stops the poller; callers that
 * want to keep going catch inside `tick` and return "continue".
 */
export function startPolling({
  tick,
  intervalMs,
  maxAttempts,
  onExhausted,
  immediate = false,
  signal,
}: PollOptions): () => void {
  const controller = new AbortController();
  const stop = () => controller.abort();
  signal?.addEventListener("abort", stop, { once: true });
  if (signal?.aborted) stop();

  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let waitingForVisible = false;

  const onVisible = () => {
    if (document.visibilityState !== "visible" || !waitingForVisible) return;
    waitingForVisible = false;
    void run();
  };

  const schedule = (delay: number) => {
    if (controller.signal.aborted) return;
    timer = setTimeout(() => void run(), delay);
  };

  const run = async () => {
    timer = null;
    if (controller.signal.aborted) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      waitingForVisible = true;
      return;
    }
    if (attempt >= maxAttempts) {
      onExhausted?.();
      stop();
      return;
    }
    attempt += 1;
    let result: PollResult;
    try {
      result = await tick(controller.signal, attempt);
    } catch {
      result = "stop";
    }
    if (result === "continue") schedule(intervalMs);
    else stop();
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisible);
  }
  controller.signal.addEventListener(
    "abort",
    () => {
      if (timer) clearTimeout(timer);
      timer = null;
      signal?.removeEventListener("abort", stop);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisible);
      }
    },
    { once: true },
  );

  if (immediate) void run();
  else schedule(intervalMs);
  return stop;
}
