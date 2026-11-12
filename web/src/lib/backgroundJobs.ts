"use client";

import { useEffect, useSyncExternalStore } from "react";

import { onAuthSessionCleared } from "./authClient";
import {
  fetchIngestionJobs,
  startClimatePull,
  type IngestionJob,
} from "./climateDataClient";
import { startPolling } from "./polling";

/**
 * Background work the server runs for this installation - today the
 * country-wide climate pulls that Dagster executes - held once per tab.
 *
 * The top bar's drawer, the Jobs tab and the Data tab all read this store, so
 * they agree with each other and a single poll serves them all. It polls only
 * while something is mounted to read it and a job is queued or running.
 */

export type BackgroundJobsState = {
  /** Newest first; null until the first answer. */
  jobs: IngestionJob[] | null;
  /** "forbidden" for accounts that may not see installation work. */
  error: "forbidden" | "unavailable" | null;
  checkedAt: number | null;
};

const POLL_INTERVAL_MS = 4_000;
/** About ten minutes of checks; a reader who stays longer can refresh. */
const MAX_POLLS = 150;
const EMPTY: BackgroundJobsState = { jobs: null, error: null, checkedAt: null };

let state = EMPTY;
let inFlight: Promise<void> | null = null;
let stopPoll: (() => void) | null = null;
const listeners = new Set<() => void>();

onAuthSessionCleared(() => {
  stopPoll?.();
  stopPoll = null;
  inFlight = null;
  set(EMPTY);
});

export function isLive(job: IngestionJob): boolean {
  return job.status === "queued" || job.status === "running";
}

function set(next: BackgroundJobsState) {
  state = next;
  for (const listener of listeners) listener();
}

function load(): Promise<void> {
  if (inFlight) return inFlight;
  const request = fetchIngestionJobs(null)
    .then((jobs) => set({ jobs, error: null, checkedAt: Date.now() }))
    .catch((cause: unknown) => {
      const message = cause instanceof Error ? cause.message : "";
      const forbidden = /403|forbidden|permission|role/i.test(message);
      set({ ...state, error: forbidden ? "forbidden" : "unavailable" });
    })
    .finally(() => {
      if (inFlight === request) inFlight = null;
    });
  inFlight = request;
  return request;
}

/** Start polling while anyone is reading and something is still moving. */
function keepPolling() {
  const live = state.jobs?.some(isLive) ?? false;
  if (listeners.size === 0 || !live) {
    stopPoll?.();
    stopPoll = null;
    return;
  }
  if (stopPoll) return;
  stopPoll = startPolling({
    intervalMs: POLL_INTERVAL_MS,
    maxAttempts: MAX_POLLS,
    onExhausted: () => (stopPoll = null),
    tick: async () => {
      await load();
      if (state.jobs?.some(isLive) && listeners.size > 0) return "continue";
      stopPoll = null;
      return "stop";
    },
  });
}

export async function refreshBackgroundJobs(): Promise<void> {
  await load();
  keepPolling();
}

/**
 * Queue a country's climate pull and show it at once: the API answers with
 * the queued job (or the one already running), which goes straight into the
 * list rather than waiting for the next check.
 */
export async function pullClimateData(
  countryCode: string,
  months?: string[],
): Promise<IngestionJob> {
  const job = await startClimatePull(null, countryCode, months);
  const others = (state.jobs ?? []).filter((item) => item.id !== job.id);
  set({ ...state, jobs: [job, ...others], checkedAt: Date.now() });
  keepPolling();
  return job;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) keepPolling();
  };
}

const noop = () => () => {};

/**
 * The shared list of background jobs. Pass `enabled: false` (e.g. a closed
 * drawer) to stop reading without unmounting. Every newly enabled reader asks
 * for a fresh list, so opening a view never shows a stale one.
 */
export function useBackgroundJobs(enabled = true): BackgroundJobsState {
  const snapshot = useSyncExternalStore(
    enabled ? subscribe : noop,
    () => state,
    () => EMPTY,
  );
  useEffect(() => {
    if (enabled) void refreshBackgroundJobs();
  }, [enabled]);
  return snapshot;
}

// ---- Wording, shared by every view of a job ---------------------------------

export function jobStatusLabel(job: IngestionJob): string {
  if (job.status === "queued") return "Queued";
  if (job.status === "running") return "Running";
  if (job.status === "completed") return "Done";
  return "Failed";
}

/** What is happening now, or how it ended. */
export function jobProgressText(job: IngestionJob): string {
  if (job.status === "queued") return "Waiting for a worker to pick it up.";
  if (job.status === "failed") return failureReason(job.error_code);
  if (job.status === "completed")
    return `${job.areas_done || job.areas_total} areas updated.`;
  if (job.stage === "downloading") return "Downloading the climate grid from ERA5.";
  if (job.stage === "writing")
    return `Saving areas: ${job.areas_done} of ${job.areas_total}.`;
  return "Preparing the download.";
}

/** 0-1 while areas are being saved; null when progress cannot be measured. */
export function jobProgressFraction(job: IngestionJob): number | null {
  if (job.status === "completed") return 1;
  if (job.status !== "running" || job.stage !== "writing" || !job.areas_total)
    return null;
  return Math.min(1, job.areas_done / job.areas_total);
}

const FAILURE_REASONS: Record<string, string> = {
  CLIMATE_INGEST_NOT_CONFIGURED:
    "Climate downloads are not set up on this server (no ERA5 credentials).",
  CLIMATE_NO_AREAS: "No areas are installed for this country yet.",
  CLIMATE_NO_GRID_CENTRES:
    "The climate grid did not cover any of this country's areas.",
  CLIMATE_PULL_INTERRUPTED: "The worker stopped before the download finished.",
  CLIMATE_STORAGE_CAPACITY_LOW: "The server is short of disk space for climate files.",
};

export function failureReason(code: string | null): string {
  return (code && FAILURE_REASONS[code]) || "The download did not finish.";
}

const regionNames =
  typeof Intl.DisplayNames === "function"
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

export function jobTitle(job: IngestionJob): string {
  let country = job.country_code;
  try {
    country = regionNames?.of(job.country_code) ?? country;
  } catch {
    // Not an ISO region code; show it as stored.
  }
  return `Climate data · ${country}`;
}
