import { AuditFlushError, postAuditBatch } from "./client";
import { useAuditStore } from "./store";

const FLUSH_INTERVAL_MS = 30_000;
const MAX_EVENTS_PER_FLUSH = 400;
const BACKOFF_MS = [2_000, 8_000, 30_000, 120_000];

type TokenGetter = () => string | null | Promise<string | null>;

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let visibilityHandler: (() => void) | null = null;
let pageHideHandler: (() => void) | null = null;
let inFlight: Promise<void> | null = null;
let failureCount = 0;
/** No automatic flush before this time; an explicit flush ignores it. */
let retryAfter = 0;

function newFlushId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function flushOnce(getToken: TokenGetter, opts: { keepalive?: boolean } = {}) {
  inFlight ??= sendBatch(getToken, opts).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function sendBatch(getToken: TokenGetter, opts: { keepalive?: boolean }) {
  const store = useAuditStore.getState();
  const events = store.takeBatch(MAX_EVENTS_PER_FLUSH);
  if (events.length === 0) return;
  // Sign-out resets the session while a batch may be in flight; acking that
  // batch's sequence numbers would then drop the next session's events.
  const sessionId = store.sessionId;
  const ack = () => {
    const current = useAuditStore.getState();
    if (current.sessionId === sessionId) {
      current.ackFlush(events[events.length - 1].client_seq);
    }
  };
  try {
    const token = await getToken();
    if (!token) return;
    await postAuditBatch(
      { session_id: sessionId, flush_id: newFlushId(), events },
      token,
      opts,
    );
    ack();
    succeeded();
  } catch (error) {
    // 4xx: poison batch — drop so we don't spin. 401 is the token, not the
    // batch, so it backs off like 5xx / network and is sent again later.
    if (
      error instanceof AuditFlushError &&
      error.status >= 400 &&
      error.status < 500 &&
      error.status !== 401
    ) {
      ack();
      succeeded();
    } else {
      failed();
    }
  }
}

function succeeded() {
  failureCount = 0;
  retryAfter = 0;
}

function failed() {
  failureCount += 1;
  retryAfter = Date.now() + BACKOFF_MS[Math.min(failureCount, BACKOFF_MS.length) - 1];
}

/**
 * Start the background flush loop. Safe to call more than once — and after
 * `stopAuditFlush` — since each call tears the previous listeners down first.
 *
 * Backoff is a point in time rather than a skipped tick, so the loop always
 * recovers: once `retryAfter` passes, the next tick tries again.
 */
export function startAuditFlush(getToken: TokenGetter): void {
  stopAuditFlush();
  if (typeof window === "undefined") return;

  intervalHandle = setInterval(() => {
    if (Date.now() >= retryAfter) void flushOnce(getToken);
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
  succeeded();
}

/** Flush now, ignoring backoff — e.g. before sign-out drops the token. */
export async function flushAuditNow(getToken: TokenGetter): Promise<void> {
  if (inFlight) await inFlight;
  await flushOnce(getToken);
}
