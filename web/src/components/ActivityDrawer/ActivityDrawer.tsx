"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { getStoredAuthSession } from "@/lib/authClient";
import { fetchIngestionJobs, type IngestionJob } from "@/lib/climateDataClient";

import styles from "./ActivityDrawer.module.css";

type Props = { open: boolean; onClose: () => void };
type PageState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; jobs: IngestionJob[] }
  | { status: "error"; message: string };

const POLL_INTERVAL_MS = 5_000;

/** Long-running server work, rather than a log of ordinary clicks and requests. */
export function ActivityDrawer({ open, onClose }: Props) {
  const [state, setState] = useState<PageState>({ status: "idle" });

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const token = getStoredAuthSession()?.accessToken;
    if (!token) {
      setState({ status: "error", message: "Sign in to see background work." });
      return;
    }
    try {
      setState({ status: "ready", jobs: await fetchIngestionJobs(token, signal) });
    } catch (cause) {
      if (signal?.aborted) return;
      const message = cause instanceof Error ? cause.message : "";
      setState({
        status: "error",
        message: /403|forbidden|permission|role/i.test(message)
          ? "No background work to show."
          : "Background work could not be checked.",
      });
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setState({ status: "loading" });
    void refresh(controller.signal);
    return () => controller.abort();
  }, [open, refresh]);

  const liveCount = useMemo(
    () =>
      state.status === "ready"
        ? state.jobs.filter(
            (job) => job.status === "queued" || job.status === "running",
          ).length
        : 0,
    [state],
  );

  useEffect(() => {
    if (!open || liveCount === 0) return;
    const timer = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [liveCount, open, refresh]);

  return (
    <>
      {open ? <div className={styles.backdrop} onClick={onClose} /> : null}
      <aside
        className={[styles.drawer, open ? styles.open : ""].filter(Boolean).join(" ")}
        aria-hidden={!open}
        aria-label="Background work"
      >
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Background work</p>
            {liveCount > 0 ? (
              <p className={styles.headerStatus} role="status">
                {liveCount} process{liveCount === 1 ? "" : "es"} running
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Close background work"
          >
            ×
          </button>
        </header>
        <div className={styles.scroll}>
          {state.status === "loading" ? (
            <p className={styles.empty}>Checking background work…</p>
          ) : null}
          {state.status === "error" ? (
            <p className={styles.empty}>{state.message}</p>
          ) : null}
          {state.status === "ready" && state.jobs.length === 0 ? (
            <p className={styles.empty}>No background work yet.</p>
          ) : null}
          {state.status === "ready" ? (
            <ul className={styles.jobs}>
              {state.jobs.map((job) => (
                <li key={job.id} className={styles.job} data-status={job.status}>
                  <div className={styles.jobTopline}>
                    <span className={styles.jobTitle}>
                      Climate data · {job.country_code}
                    </span>
                    <span className={styles.badge}>{statusLabel(job)}</span>
                  </div>
                  <p className={styles.jobDetail}>{jobDetail(job)}</p>
                  <time className={styles.jobTime} dateTime={job.updated_at}>
                    Updated {formatTime(job.updated_at)}
                  </time>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </aside>
    </>
  );
}

function statusLabel(job: IngestionJob): string {
  if (job.status === "queued") return "Waiting";
  if (job.status === "running") return "Running";
  if (job.status === "completed") return "Complete";
  return "Needs attention";
}

function jobDetail(job: IngestionJob): string {
  if (job.status === "queued") return "Waiting for the climate-data pull to begin.";
  if (job.status === "failed") return "The climate-data pull did not finish.";
  if (job.stage === "downloading") return "Downloading the climate grid…";
  if (job.stage === "writing")
    return `Saving area ${job.areas_done} of ${job.areas_total}…`;
  if (job.status === "completed")
    return `${job.areas_done || job.areas_total} areas updated.`;
  return "Preparing the climate-data pull…";
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}
