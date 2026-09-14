"use client";

import { useEffect, useMemo, useState } from "react";

import { getStoredAuthSession } from "@/lib/authClient";
import {
  getAuditEvents,
  useAuditStore,
  type AuditEventOut,
  type AuditEventType,
} from "@/lib/audit";

import styles from "./ActivityDrawer.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
};

type PageState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; items: AuditEventOut[]; nextBefore: string | null }
  | { status: "error"; message: string };

const PAGE_SIZE = 100;

export function ActivityDrawer({ open, onClose }: Props) {
  const pending = useAuditStore((state) => state.pending);
  const sessionId = useAuditStore((state) => state.sessionId);
  const [server, setServer] = useState<PageState>({ status: "idle" });
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const token = getStoredAuthSession()?.accessToken;
    if (!token) {
      setServer({ status: "error", message: "Sign in to see saved activity." });
      return () => {
        cancelled = true;
      };
    }
    setServer({ status: "loading" });
    getAuditEvents(token, { limit: PAGE_SIZE })
      .then((response) => {
        if (cancelled) return;
        setServer({
          status: "ready",
          items: response.items,
          nextBefore: response.next_before,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setServer({
          status: "error",
          message:
            error instanceof Error ? error.message : "Activity could not be loaded.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const items = useMemo(
    () => mergeItems(pending, sessionId, server),
    [pending, sessionId, server],
  );
  const groups = useMemo(() => groupByDay(items), [items]);

  async function loadMore() {
    if (server.status !== "ready" || !server.nextBefore) return;
    const token = getStoredAuthSession()?.accessToken;
    if (!token) return;
    setLoadingMore(true);
    try {
      const response = await getAuditEvents(token, {
        limit: PAGE_SIZE,
        before: server.nextBefore,
      });
      setServer({
        status: "ready",
        items: [...server.items, ...response.items],
        nextBefore: response.next_before,
      });
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <>
      {open ? <div className={styles.backdrop} onClick={onClose} /> : null}
      <aside
        className={[styles.drawer, open ? styles.open : ""].filter(Boolean).join(" ")}
        aria-hidden={!open}
        aria-label="Activity log"
      >
        <header className={styles.header}>
          <p className={styles.eyebrow}>Activity</p>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Close activity log"
          >
            ×
          </button>
        </header>
        <div className={styles.scroll}>
          {server.status === "loading" ? (
            <p className={styles.empty}>Loading…</p>
          ) : null}
          {server.status === "error" ? (
            <p className={styles.empty}>{server.message}</p>
          ) : null}
          {groups.length === 0 && server.status !== "loading" ? (
            <p className={styles.empty}>Nothing recorded yet.</p>
          ) : null}
          {groups.map(([day, dayItems]) => (
            <section key={day} className={styles.group}>
              <h3 className={styles.groupDay}>{day}</h3>
              <ul className={styles.list}>
                {dayItems.map((item) => (
                  <li key={item.key} className={styles.row} data-pending={item.pending}>
                    <span className={styles.type}>{eventLabel(item.event_type)}</span>
                    <span className={styles.summary}>{summarize(item)}</span>
                    <time className={styles.when}>{formatTime(item.occurred_at)}</time>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {server.status === "ready" && server.nextBefore ? (
            <button
              type="button"
              className={styles.loadMore}
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore ? "Loading…" : "Load older"}
            </button>
          ) : null}
        </div>
      </aside>
    </>
  );
}

type ViewItem = {
  key: string;
  event_type: AuditEventType;
  occurred_at: string;
  pending: boolean;
  geography_id: string | null;
  payload: Record<string, unknown>;
  run_summary: AuditEventOut["run_summary"];
};

function mergeItems(
  pending: ReturnType<typeof useAuditStore.getState>["pending"],
  sessionId: string,
  server: PageState,
): ViewItem[] {
  const serverItems: ViewItem[] =
    server.status === "ready"
      ? server.items.map((event) => ({
          key: `s:${event.id}`,
          event_type: event.event_type,
          occurred_at: event.occurred_at,
          pending: false,
          geography_id: event.geography_id,
          payload: event.payload,
          run_summary: event.run_summary,
        }))
      : [];
  const persistedKeys = new Set(
    server.status === "ready"
      ? server.items
          .filter((event) => event.session_id === sessionId)
          .map((event) => event.client_seq)
      : [],
  );
  const pendingItems: ViewItem[] = pending
    .filter((event) => !persistedKeys.has(event.client_seq))
    .map((event) => ({
      key: `p:${event.client_seq}`,
      event_type: event.event_type,
      occurred_at: event.occurred_at,
      pending: true,
      geography_id: event.geography_id ?? null,
      payload: (event.payload ?? {}) as Record<string, unknown>,
      run_summary: null,
    }));
  return [...pendingItems, ...serverItems].sort((a, b) =>
    b.occurred_at.localeCompare(a.occurred_at),
  );
}

function groupByDay(items: ViewItem[]): [string, ViewItem[]][] {
  const groups = new Map<string, ViewItem[]>();
  for (const item of items) {
    const day = item.occurred_at.slice(0, 10);
    const bucket = groups.get(day) ?? [];
    bucket.push(item);
    groups.set(day, bucket);
  }
  return Array.from(groups.entries());
}

const EVENT_LABEL: Record<AuditEventType, string> = {
  signin: "Sign-in",
  signout: "Sign-out",
  page_view: "Page",
  district_switch: "District",
  whatif_tick: "What-if",
  whatif_settled: "Settled",
  prediction_submitted: "Run submitted",
  prediction_completed: "Run done",
  prediction_failed: "Run failed",
};

function eventLabel(type: AuditEventType): string {
  return EVENT_LABEL[type];
}

function summarize(item: ViewItem): string {
  const { event_type, payload, run_summary, geography_id } = item;
  switch (event_type) {
    case "signin":
      return typeof payload.username === "string" ? String(payload.username) : "";
    case "signout":
      return "";
    case "page_view":
      return typeof payload.pathname === "string" ? String(payload.pathname) : "";
    case "district_switch":
      return payload.to
        ? `${payload.from ?? "state"} → ${payload.to}`
        : `${payload.from ?? "state"} → state`;
    case "whatif_tick":
    case "whatif_settled":
      return `${numberOr(payload.temperature_c, "?")}°C · ${numberOr(payload.af_percent, "?")}% · ${geography_id ?? ""}`;
    case "prediction_submitted":
      return `#${run_summary?.request_id ?? "?"} · ${run_summary?.admin_unit_name ?? geography_id ?? ""}`;
    case "prediction_completed":
      return `#${run_summary?.request_id ?? "?"} · completed`;
    case "prediction_failed":
      return `#${run_summary?.request_id ?? "?"} · failed`;
    default:
      return "";
  }
}

function numberOr(value: unknown, fallback: string): string {
  return typeof value === "number" ? value.toFixed(1) : fallback;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}
