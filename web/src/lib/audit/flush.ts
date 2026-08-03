import { AuditFlushError, postAuditBatch } from "./client";
import { useAuditStore } from "./store";

const FLUSH_INTERVAL_MS = 30_000;
const MAX_EVENTS_PER_FLUSH = 400;
const BACKOFF_MS = [2_000, 8_000, 30_000];

type TokenGetter = () => string | null;

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let visibilityHandler: (() => void) | null = null;
let pageHideHandler: (() => void) | null = null;
let inFlight = false;
let failureCount = 0;

function newFlushId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function flushOnce(getToken: TokenGetter, opts: { keepalive?: boolean } = {}) {
  if (inFlight) return;
  const token = getToken();
  if (!token) return;
  const store = useAuditStore.getState();
  const events = store.takeBatch(MAX_EVENTS_PER_FLUSH);
  if (events.length === 0) return;
  inFlight = true;
  try {
    await postAuditBatch(
      {
        session_id: store.sessionId,
        flush_id: newFlushId(),
        events,
      },
      token,
      opts,
    );
    store.ackFlush(events[events.length - 1].client_seq);
    failureCount = 0;
  } catch (error) {
    // 4xx: poison batch — drop so we don't spin. 5xx / network: back off.
    if (error instanceof AuditFlushError && error.status >= 400 && error.status < 500) {
      store.ackFlush(events[events.length - 1].client_seq);
      failureCount = 0;
    } else {
      failureCount = Math.min(failureCount + 1, BACKOFF_MS.length);
    }
  } finally {
    inFlight = false;
  }
}

/**
 * Start the background flush loop. Safe to call more than once — subsequent
 * calls tear the previous listeners down first so token refreshes replace
 * the getter cleanly.
 */
export function startAuditFlush(getToken: TokenGetter): void {
  stopAuditFlush();
  if (typeof window === "undefined") return;

  intervalHandle = setInterval(() => {
    const backoffSlot = failureCount > 0 ? BACKOFF_MS[failureCount - 1] : 0;
    if (backoffSlot === 0) void flushOnce(getToken);
  }, FLUSH_INTERVAL_MS);

  visibilityHandler = () => {
    if (document.visibilityState === "hidden") void flushOnce(getToken);
  };
  pageHideHandler = () => {
    // keepalive lets the request survive the page teardown up to 64 KB —
    // ample for our 400-event batches. This is the sendBeacon alternative
    // that lets us keep the Authorization header.
    void flushOnce(getToken, { keepalive: true });
  };

  document.addEventListener("visibilitychange", visibilityHandler);
  window.addEventListener("pagehide", pageHideHandler);
}

export function stopAuditFlush(): void {
  if (intervalHandle !== null) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  if (visibilityHandler && typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", visibilityHandler);
    visibilityHandler = null;
  }
  if (pageHideHandler && typeof window !== "undefined") {
    window.removeEventListener("pagehide", pageHideHandler);
    pageHideHandler = null;
  }
  inFlight = false;
  failureCount = 0;
}

/** Testing hook — force a synchronous flush attempt. */
export async function flushAuditNow(getToken: TokenGetter): Promise<void> {
  await flushOnce(getToken);
}
