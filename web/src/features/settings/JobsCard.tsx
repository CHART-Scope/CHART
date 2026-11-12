"use client";

import { useState } from "react";

import { Button } from "@/components/Button";
import { JobList } from "@/components/JobList";
import { SettingsCard } from "@/features/planning/SettingsCard";
import {
  isLive,
  pullClimateData,
  refreshBackgroundJobs,
  useBackgroundJobs,
} from "@/lib/backgroundJobs";
import type { IngestionJob } from "@/lib/climateDataClient";

import styles from "./JobsCard.module.css";

/**
 * Settings > Jobs: the background work running on the server's Dagster
 * workers, newest first. It reads the same store as the top bar's drawer and
 * the Data tab, and checks again every few seconds while anything is queued
 * or running.
 */
export function JobsCard() {
  const { jobs, error, checkedAt } = useBackgroundJobs();
  const [retrying, setRetrying] = useState<number | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const live = jobs?.filter(isLive).length ?? 0;

  async function retry(job: IngestionJob) {
    setRetrying(job.id);
    setRetryError(null);
    try {
      await pullClimateData(job.country_code, job.months);
    } catch (cause) {
      setRetryError(
        cause instanceof Error ? cause.message : "The retry could not start.",
      );
    } finally {
      setRetrying(null);
    }
  }

  return (
    <SettingsCard
      eyebrow="Background jobs"
      title="Running and recent work"
      headingId="jobs-heading"
      description="Climate pulls run in the background and can take several minutes. Leave this page open or come back later: progress is kept on the server."
      loading={jobs === null && !error}
      loadingRows={2}
      error={
        retryError ??
        (error === "unavailable"
          ? "Could not check the latest status. Showing the last update."
          : error === "forbidden"
            ? "Your account cannot see installation jobs."
            : null)
      }
      action={
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void refreshBackgroundJobs()}
        >
          Refresh
        </Button>
      }
    >
      {jobs !== null ? (
        <>
          <p className={styles.summary} role="status" aria-live="polite">
            {[
              live > 0 ? `${live} running · updating every few seconds` : null,
              live === 0 && jobs.length > 0 ? "Nothing running right now" : null,
              checkedAt ? `Checked ${new Date(checkedAt).toLocaleTimeString()}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {jobs.length === 0 ? (
            <p className={styles.empty}>
              No jobs yet. Pulling climate data from the Data tab starts one.
            </p>
          ) : (
            <JobList
              jobs={jobs}
              onRetry={(job) => void retry(job)}
              retryingId={retrying}
            />
          )}
        </>
      ) : null}
    </SettingsCard>
  );
}
