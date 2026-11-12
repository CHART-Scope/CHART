"use client";

import Link from "next/link";

import { isLive, useBackgroundJobs } from "@/lib/backgroundJobs";

import { JobList } from "../JobList";
import styles from "./ActivityDrawer.module.css";

type Props = { open: boolean; onClose: () => void };

/** How many jobs the drawer shows; the Jobs tab in Settings has the rest. */
const DRAWER_LIMIT = 6;

/**
 * Long-running server work, rather than a log of ordinary clicks and
 * requests. A glance at the same list the Settings > Jobs tab shows.
 */
export function ActivityDrawer({ open, onClose }: Props) {
  const { jobs, error } = useBackgroundJobs(open);
  const liveCount = jobs?.filter(isLive).length ?? 0;

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
                {liveCount} job{liveCount === 1 ? "" : "s"} running
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
          {error === "forbidden" ? (
            <p className={styles.empty}>No background work to show.</p>
          ) : error && !jobs ? (
            <p className={styles.empty}>Background work could not be checked.</p>
          ) : jobs === null ? (
            <p className={styles.empty}>Checking background work…</p>
          ) : jobs.length === 0 ? (
            <p className={styles.empty}>No background work yet.</p>
          ) : (
            <>
              <JobList jobs={jobs.slice(0, DRAWER_LIMIT)} compact />
              <Link href="/settings?tab=jobs" className={styles.all} onClick={onClose}>
                All jobs in Settings →
              </Link>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
