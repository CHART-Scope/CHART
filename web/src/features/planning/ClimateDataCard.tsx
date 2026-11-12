"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";

import { Button } from "@/components/Button";
import { JobStatusBadge } from "@/components/JobList";
import {
  isLive,
  jobProgressText,
  pullClimateData,
  refreshBackgroundJobs,
  useBackgroundJobs,
} from "@/lib/backgroundJobs";
import {
  fetchClimateCoverage,
  type CountryCoverage,
  type IngestionJob,
} from "@/lib/climateDataClient";

import { SettingsCard } from "./SettingsCard";
import styles from "./ClimateDataCard.module.css";

/**
 * Which countries hold climate data, and a way to fetch more.
 *
 * One pull per country: a single download covering every deployed area,
 * rather than one Copernicus request per area per month. A pull takes
 * minutes, so the request only queues the job; its progress comes from the
 * shared background-jobs store the Jobs tab and the top bar's drawer read.
 */

type Props = { accessToken: string };

export function ClimateDataCard({ accessToken }: Props) {
  const [coverage, setCoverage] = useState<CountryCoverage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const { jobs } = useBackgroundJobs();

  // Coverage changes when a pull finishes, so it is read again then.
  const finished = (jobs ?? [])
    .filter((job) => job.status === "completed")
    .map((job) => job.id)
    .join();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetchClimateCoverage(accessToken, controller.signal)
      .then((next) => {
        setCoverage(next);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error ? cause.message : "Could not load climate data.",
        );
      });
    return () => controller.abort();
  }, [accessToken, finished, attempt]);

  async function pull(countryCode: string) {
    setStarting(countryCode);
    setError(null);
    try {
      await pullClimateData(countryCode);
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
      description="One pull downloads a single ERA5 grid for the whole country and derives every area from it. It runs in the background; follow it here or in Jobs."
      loading={coverage === null && !error}
      loadingRows={2}
      error={error}
      action={
        error ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setError(null);
              setAttempt((value) => value + 1);
              void refreshBackgroundJobs();
            }}
          >
            Check again
          </Button>
        ) : undefined
      }
    >
      {coverage ? (
        <ClimateDataTable
          coverage={coverage}
          jobs={jobs ?? []}
          startingCode={starting}
          onPull={(code) => void pull(code)}
        />
      ) : null}
    </SettingsCard>
  );
}

type TableProps = {
  coverage: CountryCoverage[];
  /** Newest first; each row reads its country's latest job. */
  jobs: IngestionJob[];
  startingCode?: string | null;
  onPull: (countryCode: string) => void;
};

/** One row per country: what is held, the latest pull, and the action. */
export function ClimateDataTable({
  coverage,
  jobs,
  startingCode = null,
  onPull,
}: TableProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (coverage.length === 0)
    return (
      <p className={styles.empty} role="status">
        No geographies are installed yet.
      </p>
    );

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">Country</th>
          <th scope="col">Areas with data</th>
          <th scope="col">Months held</th>
          <th scope="col">Latest pull</th>
          <th scope="col">
            <span className={styles.visuallyHidden}>Action</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {coverage.map((country) => {
          const code = country.country_code;
          const job = jobs.find((item) => item.country_code === code) ?? null;
          const live = job ? isLive(job) : false;
          const open = expanded === code;
          return (
            <Fragment key={code}>
              <tr className={styles.row} aria-label={country.name}>
                <th scope="row" className={styles.countryCell}>
                  <button
                    type="button"
                    className={styles.disclosure}
                    aria-expanded={open}
                    aria-controls={`climate-areas-${code}`}
                    onClick={() => setExpanded(open ? null : code)}
                  >
                    <span
                      className={styles.chevron}
                      data-open={open || undefined}
                      aria-hidden
                    >
                      ›
                    </span>
                    {country.name}
                  </button>
                </th>
                <td data-label="Areas">
                  {country.areas_with_data} of {country.areas_total}
                </td>
                <td data-label="Months">
                  {country.months > 0 ? (
                    <>
                      {country.months}
                      {country.earliest && country.latest ? (
                        <span className={styles.muted}>
                          {" "}
                          · {monthLabel(country.earliest)} –{" "}
                          {monthLabel(country.latest)}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span className={styles.muted}>None yet</span>
                  )}
                </td>
                <td data-label="Latest pull" className={styles.statusCell}>
                  {job ? (
                    <span className={styles.status} role={live ? "status" : undefined}>
                      <JobStatusBadge job={job} />
                      <span className={styles.statusText}>
                        {job.status === "failed" ? (
                          <Link href="/settings?tab=jobs">See why in Jobs</Link>
                        ) : job.status === "completed" ? (
                          dayLabel(job.completed_at ?? job.updated_at)
                        ) : (
                          jobProgressText(job)
                        )}
                      </span>
                    </span>
                  ) : (
                    <span className={styles.muted}>Never pulled</span>
                  )}
                </td>
                <td className={styles.actionCell}>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onPull(code)}
                    disabled={live || startingCode === code}
                    aria-label={`${job?.status === "failed" ? "Retry" : "Pull"} climate data for ${country.name}`}
                  >
                    {startingCode === code
                      ? "Starting…"
                      : live
                        ? "Pulling…"
                        : job?.status === "failed"
                          ? "Retry"
                          : "Pull"}
                  </Button>
                </td>
              </tr>
              {open ? (
                <tr className={styles.areasRow} id={`climate-areas-${code}`}>
                  <td colSpan={5}>
                    <ul className={styles.areas} aria-label={`${country.name} areas`}>
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
                  </td>
                </tr>
              ) : null}
            </Fragment>
          );
        })}
      </tbody>
    </table>
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

function dayLabel(iso: string): string {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(
    new Date(iso),
  );
}
