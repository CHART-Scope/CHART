"use client";

import { useEffect, useMemo, useState } from "react";

import {
  getPredictionRequest,
  listPredictionRequests,
  type PredictionRequest,
  type PredictionSummary,
} from "@/lib/planningClient";

import styles from "./RunsStrip.module.css";


type Props = {
  geographyId: string;
  accessToken: string;
  /** Bump this when a new run completes to force a reload of the list. */
  refreshKey?: string | null;
};


type Load =
  | { status: "loading" }
  | { status: "ready"; items: PredictionSummary[] }
  | { status: "error"; message: string };


const STATUS_COLOR: Record<string, string> = {
  completed: "#4b8b3b",
  running: "#c9922e",
  queued: "#c9922e",
  waiting: "#4a4a4a",
  failed: "#c04747",
};


export function RunsStrip({ geographyId, accessToken, refreshKey }: Props) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [openRunId, setOpenRunId] = useState<number | null>(null);
  const [detail, setDetail] = useState<PredictionRequest | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoad({ status: "loading" });
    listPredictionRequests(geographyId, accessToken)
      .then((items) => {
        if (!cancelled) setLoad({ status: "ready", items: items.slice(0, 8) });
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

  useEffect(() => {
    if (openRunId === null) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetail(null);
    getPredictionRequest(openRunId, accessToken)
      .then((run) => {
        if (!cancelled) setDetail(run);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, openRunId]);

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
              <button
                type="button"
                data-active={run.request_id === openRunId}
                className={styles.chip}
                onClick={() =>
                  setOpenRunId((current) =>
                    current === run.request_id ? null : run.request_id,
                  )
                }
              >
                <span
                  className={styles.dot}
                  style={{ background: STATUS_COLOR[run.status] ?? "#4a4a4a" }}
                  aria-hidden
                />
                <span>{formatRunDate(run.created_at)}</span>
                <span className={styles.chipStatus}>{run.status}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {detail ? <RunDetail run={detail} /> : null}
    </section>
  );
}


function RunDetail({ run }: { run: PredictionRequest }) {
  const prediction = run.result?.prediction ?? null;
  const climate = run.result?.climate ?? run.climate;
  const orderedClimate = [...climate].sort((left, right) =>
    left.month.localeCompare(right.month),
  );
  return (
    <div className={styles.detail}>
      <div className={styles.detailHeader}>
        <p>
          <strong>Planning date:</strong> {run.planning_date}
        </p>
        <p>
          <strong>Status:</strong> {run.status}
          {run.error_code ? ` · ${run.error_code}` : null}
        </p>
      </div>
      {prediction ? (
        <div className={styles.detailStats}>
          <div>
            <span>Odds ratio</span>
            <strong>{prediction.odds_ratio.toFixed(2)}</strong>
          </div>
          <div>
            <span>95% CI</span>
            <strong>
              {prediction.ci95_low.toFixed(2)} – {prediction.ci95_high.toFixed(2)}
            </strong>
          </div>
          <div>
            <span>Model</span>
            <strong>{prediction.model_version}</strong>
          </div>
        </div>
      ) : (
        <p className={styles.detailPending}>
          The model result is not ready for this run yet.
        </p>
      )}
      {orderedClimate.length > 0 ? (
        <ul className={styles.climateRow}>
          {orderedClimate.map((month) => (
            <li key={month.month}>
              <span>{month.month}</span>
              <strong>
                {month.temperature_c !== null
                  ? `${month.temperature_c.toFixed(1)}°C`
                  : "—"}
              </strong>
              <small>{month.source_name ?? "—"}</small>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
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
