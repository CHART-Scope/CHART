"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  listPredictionRequests,
  type PredictionSummary,
} from "@/lib/planningClient";

import styles from "./RunsStrip.module.css";


type Props = {
  geographyId: string;
  accessToken: string;
  /** Build the URL each chip links to. */
  linkForRun: (requestId: number) => string;
  /** Highlight the chip for the run currently being viewed, if any. */
  activeRunId?: number | null;
  /** Bump this when a new run completes to force a reload of the list. */
  refreshKey?: string | null;
};


type Load =
  | { status: "loading" }
  | { status: "ready"; items: PredictionSummary[] }
  | { status: "error"; message: string };


const STATUS_COLOR: Record<string, string> = {
  completed: "var(--color-success)",
  running: "var(--color-amber)",
  queued: "var(--color-amber)",
  waiting: "var(--color-text-muted)",
  failed: "var(--color-sem-low)",
};


export function RunsStrip({
  geographyId,
  accessToken,
  linkForRun,
  activeRunId = null,
  refreshKey,
}: Props) {
  const [load, setLoad] = useState<Load>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setLoad({ status: "loading" });
    listPredictionRequests(geographyId, accessToken)
      .then((items) => {
        if (!cancelled) setLoad({ status: "ready", items: items.slice(0, 12) });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoad({
          status: "error",
          message: error instanceof Error ? error.message : "Runs unavailable.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, geographyId, refreshKey]);

  const chips = useMemo(
    () => (load.status === "ready" ? load.items : []),
    [load],
  );

  return (
    <section className={styles.wrap} aria-label="Recent planning runs">
      <header className={styles.header}>
        <p className={styles.eyebrow}>Recent runs</p>
      </header>
      {load.status === "loading" ? (
        <p className={styles.empty}>Loading recent runs…</p>
      ) : load.status === "error" ? (
        <p className={styles.empty}>{load.message}</p>
      ) : chips.length === 0 ? (
        <p className={styles.empty}>
          No runs yet — your first prediction is being prepared above.
        </p>
      ) : (
        <ul className={styles.chips}>
          {chips.map((run) => (
            <li key={run.request_id}>
              <Link
                href={linkForRun(run.request_id)}
                data-active={run.request_id === activeRunId}
                className={styles.chip}
              >
                <span
                  className={styles.dot}
                  style={{ background: STATUS_COLOR[run.status] ?? "var(--color-text-muted)" }}
                  aria-hidden
                />
                <span>{formatRunDate(run.created_at)}</span>
                <span className={styles.chipStatus}>{run.status}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}


function formatRunDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
