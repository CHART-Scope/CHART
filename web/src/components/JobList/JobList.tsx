import type { IngestionJob } from "@/lib/climateDataClient";
import {
  isLive,
  jobProgressFraction,
  jobProgressText,
  jobStatusLabel,
  jobTitle,
} from "@/lib/backgroundJobs";

import { Button } from "../Button";
import styles from "./JobList.module.css";

type Props = {
  jobs: IngestionJob[];
  /** Offered on failed jobs; omit for a read-only list (the top bar drawer). */
  onRetry?: (job: IngestionJob) => void;
  /** The job whose retry is being sent. */
  retryingId?: number | null;
  /** Fewer details, for the narrow drawer. */
  compact?: boolean;
  /** Clock for elapsed times; injectable so stories and tests stay stable. */
  now?: number;
};

/**
 * Running and recent background jobs: what, where, when, how far, and - for a
 * failure - why, with a way to run it again. The Jobs tab and the top bar's
 * drawer both render this list, so a job reads the same everywhere.
 */
export function JobList({ jobs, onRetry, retryingId = null, compact, now }: Props) {
  const clock = now ?? Date.now();
  return (
    <ol className={styles.list} data-compact={compact || undefined}>
      {jobs.map((job) => {
        const fraction = jobProgressFraction(job);
        const title = jobTitle(job);
        return (
          <li
            key={job.id}
            className={styles.job}
            data-status={job.status}
            aria-label={`${title}, ${jobStatusLabel(job)}`}
          >
            <div className={styles.topline}>
              <JobStatusBadge job={job} />
              <span className={styles.title}>{title}</span>
            </div>
            <p
              className={styles.progress}
              role={job.status === "failed" ? "alert" : undefined}
            >
              {jobProgressText(job)}
              {job.status === "failed" && job.error_code ? (
                <span className={styles.code}> Reference: {job.error_code}</span>
              ) : null}
            </p>
            {isLive(job) ? (
              <div
                className={styles.bar}
                role="progressbar"
                aria-label={`${title} progress`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={
                  fraction === null ? undefined : Math.round(fraction * 100)
                }
                data-indeterminate={fraction === null || undefined}
              >
                <span style={{ width: `${Math.round((fraction ?? 0.3) * 100)}%` }} />
              </div>
            ) : null}
            <p className={styles.meta}>
              <time dateTime={job.created_at}>
                Started {formatTime(job.created_at)}
              </time>
              {" · "}
              {formatDuration(job, clock)}
              {!compact && job.months.length > 0 ? ` · ${monthsLabel(job.months)}` : ""}
              {!compact ? ` · Job #${job.id}` : ""}
            </p>
            {onRetry && job.status === "failed" ? (
              <div className={styles.actions}>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onRetry(job)}
                  disabled={retryingId === job.id}
                >
                  {retryingId === job.id ? "Starting…" : "Retry"}
                </Button>
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/** The coloured status word, also used inline in the Data tab's table. */
export function JobStatusBadge({ job }: { job: IngestionJob }) {
  return (
    <span className={styles.badge} data-status={job.status}>
      {job.status === "running" ? (
        <span className={styles.spinner} aria-hidden />
      ) : null}
      {jobStatusLabel(job)}
    </span>
  );
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** "Running for 3 min" while live; "Took 1 h 4 min" once finished. */
function formatDuration(job: IngestionJob, now: number): string {
  const start = Date.parse(job.created_at);
  const end = isLive(job) ? now : Date.parse(job.completed_at ?? job.updated_at);
  const minutes = Math.max(0, Math.round((end - start) / 60_000));
  const span =
    minutes < 1
      ? "under a minute"
      : minutes < 60
        ? `${minutes} min`
        : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  if (isLive(job)) return `${job.status === "queued" ? "Waiting" : "Running"} ${span}`;
  return `${job.status === "failed" ? "Stopped after" : "Took"} ${span}`;
}

/** ["2025-10", …, "2026-09"] -> "Oct 2025 – Sep 2026". */
function monthsLabel(months: string[]): string {
  const format = (value: string) =>
    new Intl.DateTimeFormat("en", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${value.slice(0, 7)}-01T00:00:00Z`));
  const sorted = [...months].sort();
  const first = format(sorted[0]);
  const last = format(sorted[sorted.length - 1]);
  return first === last ? first : `${first} – ${last}`;
}
