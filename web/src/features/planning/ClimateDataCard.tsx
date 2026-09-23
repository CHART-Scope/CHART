"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchClimateCoverage,
  fetchIngestionJobs,
  startClimatePull,
  type CountryCoverage,
  type IngestionJob,
} from "@/lib/climateDataClient";

import { SettingsCard } from "./SettingsCard";
import styles from "./ClimateDataCard.module.css";

/**
 * Which places hold climate data, and a way to fetch more.
 *
 * Climate used to arrive only as a side effect of opening a dashboard — one
 * Copernicus request per area per month, each a median 215s in their queue.
 * A country's worth of areas made more work than the workers could drain, and
 * because nothing showed it, a slow queue looked like a broken dashboard.
 *
 * Here it is one deliberate operation per country: one download covering
 * every deployed area, visible while it runs. A pull takes minutes, so the
 * request only queues the job and this polls it.
 */

const POLL_INTERVAL_MS = 5_000;

type Props = { accessToken: string };

export function ClimateDataCard({ accessToken }: Props) {
  const [coverage, setCoverage] = useState<CountryCoverage[] | null>(null);
  const [jobs, setJobs] = useState<IngestionJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const cancelled = useRef(false);
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [nextCoverage, nextJobs] = await Promise.all([
      fetchClimateCoverage(accessToken),
      fetchIngestionJobs(accessToken),
    ]);
    if (cancelled.current) return;
    setCoverage(nextCoverage);
    setJobs(nextJobs);
    setError(null);
    setLastChecked(new Date().toLocaleTimeString());
  }, [accessToken]);

  useEffect(() => {
    cancelled.current = false;
    refresh().catch((cause: unknown) => {
      if (cancelled.current) return;
      setError(cause instanceof Error ? cause.message : "Could not load climate data.");
    });
    return () => {
      cancelled.current = true;
    };
  }, [refresh]);

  // Poll only while something is actually running. A settings page that
  // refetches forever is a cost with no reader.
  const live = jobs.filter(
    (job) => job.status === "queued" || job.status === "running",
  );
  useEffect(() => {
    if (live.length === 0) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        await refresh();
      } catch {
        if (!stopped)
          setError(
            "Could not check the latest status. Showing the last update and trying again.",
          );
      } finally {
        if (!stopped) timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    }
    timer = setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [live.length, refresh]);

  const jobFor = (countryCode: string) =>
    jobs.find((job) => job.country_code === countryCode) ?? null;

  async function pull(countryCode: string) {
    setStarting(countryCode);
    setError(null);
    try {
      await startClimatePull(accessToken, countryCode);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The pull could not start.");
    } finally {
      setStarting(null);
    }
  }

  return (
    <SettingsCard
      eyebrow="Climate data"
      title="Observations held per country"
      headingId="climate-data-heading"
      description="One pull fetches a single grid covering every area in the country, so a country costs one request rather than one per area per month."
      loading={coverage === null && !error}
      loadingRows={2}
      error={error}
      action={
        error ? (
          <button
            type="button"
            className={styles.pull}
            onClick={() => void refresh().catch(() => {})}
          >
            Check again
          </button>
        ) : undefined
      }
    >
      {coverage !== null && coverage.length === 0 ? (
        <p className={styles.empty} role="status">
          No geographies are installed yet.
        </p>
      ) : (
        <ul className={styles.list}>
          {(coverage ?? []).map((country) => {
            const job = jobFor(country.country_code);
            const running = job?.status === "queued" || job?.status === "running";
            const open = expanded === country.country_code;
            return (
              <li key={country.country_code} className={styles.row}>
                <div className={styles.rowMain}>
                  <button
                    type="button"
                    className={styles.disclosure}
                    aria-expanded={open}
                    onClick={() => setExpanded(open ? null : country.country_code)}
                  >
                    <span className={styles.chevron} data-open={open || undefined}>
                      ›
                    </span>
                    <span className={styles.country}>{country.name}</span>
                  </button>

                  <span className={styles.summary}>
                    {country.areas_with_data}/{country.areas_total} areas
                    {country.months > 0 ? (
                      <>
                        {" · "}
                        {country.months} months
                        {country.earliest && country.latest ? (
                          <span className={styles.range}>
                            {" "}
                            ({monthLabel(country.earliest)}–{monthLabel(country.latest)}
                            )
                          </span>
                        ) : null}
                      </>
                    ) : (
                      " · no data yet"
                    )}
                  </span>

                  {running ? (
                    <span className={styles.progress} role="status">
                      {job.status === "running" && (
                        <span className={styles.spinner} aria-hidden="true" />
                      )}
                      {stageLabel(job)}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className={styles.pull}
                      onClick={() => void pull(country.country_code)}
                      disabled={starting === country.country_code}
                    >
                      {starting === country.country_code
                        ? "Starting…"
                        : job?.status === "failed"
                          ? "Try again"
                          : "Pull"}
                    </button>
                  )}
                </div>

                {running && job ? (
                  <p className={styles.empty}>
                    {job.status === "queued"
                      ? `Requested ${new Date(job.created_at).toLocaleString()}. The download has not started.`
                      : `Last progress: ${new Date(job.updated_at).toLocaleString()}.`}
                    {lastChecked ? ` Last checked ${lastChecked}.` : ""}
                  </p>
                ) : null}
                {job?.status === "failed" ? (
                  <p className={styles.rowError} role="alert">
                    The last download did not finish. You can try again.
                    {job.error_code ? ` (Reference: ${job.error_code})` : ""}
                  </p>
                ) : null}

                {open ? (
                  <ul className={styles.areas}>
                    {country.areas.map((area) => (
                      <li key={area.admin_unit_id} className={styles.area}>
                        <span>{area.name}</span>
                        <span
                          className={styles.areaMonths}
                          data-empty={area.months === 0 || undefined}
                        >
                          {area.months === 0
                            ? "no data"
                            : `${area.months} months${
                                area.latest ? ` to ${monthLabel(area.latest)}` : ""
                              }`}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </SettingsCard>
  );
}

/** `2026-08-01` -> `Aug 2026`. */
function monthLabel(value: string): string {
  const parsed = new Date(`${value.slice(0, 7)}-01T00:00:00Z`);
  return new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function stageLabel(job: IngestionJob | null): string {
  if (!job) return "Working…";
  if (job.stage === "downloading") return "Downloading the grid…";
  if (job.stage === "writing") {
    // Areas rather than a percentage: a country of 47 should show it is
    // moving, and the denominator is the thing a reader recognises.
    return `Writing areas ${job.areas_done}/${job.areas_total}…`;
  }
  return job.status === "queued" ? "Waiting to begin" : "Preparing the download…";
}
