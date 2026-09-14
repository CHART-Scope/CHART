"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/Button";
import { getPredictionRequest, type PredictionRequest } from "@/lib/planningClient";

import styles from "./RunDetail.module.css";

type Props = {
  requestId: number;
  accessToken: string;
  backHref: string;
};

type Load =
  | { status: "loading" }
  | { status: "ready"; run: PredictionRequest }
  | { status: "error"; message: string };

/**
 * Standalone view of one prediction request. Reachable at a stable URL
 * so a user can share or bookmark a specific run (e.g. one they saved
 * with the bookmark icon on /plan). Reuses the existing planning-client
 * fetch; no new endpoint required.
 */
export function RunDetail({ requestId, accessToken, backHref }: Props) {
  const [load, setLoad] = useState<Load>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setLoad({ status: "loading" });
    getPredictionRequest(requestId, accessToken)
      .then((run) => {
        if (!cancelled) setLoad({ status: "ready", run });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoad({
          status: "error",
          message: error instanceof Error ? error.message : "Run could not be loaded.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, requestId]);

  if (load.status === "loading") {
    return <p className={styles.empty}>Loading run…</p>;
  }
  if (load.status === "error") {
    return <p className={styles.empty}>{load.message}</p>;
  }

  const { run } = load;
  const prediction = run.result?.prediction ?? null;
  const climate = run.result?.climate ?? run.climate;
  const orderedClimate = [...climate].sort((left, right) =>
    left.month.localeCompare(right.month),
  );

  return (
    <article className={styles.detail}>
      <header className={styles.detailHeader}>
        <div>
          <p className={styles.eyebrow}>Prediction run</p>
          <h1 className={styles.title}>#{run.request_id}</h1>
        </div>
        <Button variant="secondary" size="sm">
          <a href={backHref} className={styles.backLink}>
            Back to dashboard
          </a>
        </Button>
      </header>
      <dl className={styles.meta}>
        <div>
          <dt>Planning date</dt>
          <dd>{run.planning_date}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            {run.status}
            {run.error_code ? ` · ${run.error_code}` : null}
          </dd>
        </div>
        <div>
          <dt>Stage</dt>
          <dd>{run.stage}</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{new Date(run.created_at).toLocaleString()}</dd>
        </div>
      </dl>

      {prediction ? (
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>Model output</h2>
          <div className={styles.stats}>
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
              <span>Reference</span>
              <strong>{prediction.reference_temperature_c.toFixed(1)}°C</strong>
            </div>
            <div>
              <span>Model</span>
              <strong>{prediction.model_version}</strong>
            </div>
          </div>
        </section>
      ) : (
        <section className={styles.section}>
          <p className={styles.empty}>
            The model result is not ready for this run yet.
          </p>
        </section>
      )}

      {orderedClimate.length > 0 ? (
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>Three climate months</h2>
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
        </section>
      ) : null}
    </article>
  );
}
