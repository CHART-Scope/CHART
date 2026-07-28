"use client";

import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import type {
  GeographyRecord,
  LbwPrediction,
  PlanningOptions,
  PredictionRequest,
  PredictionSummary,
} from "@/lib/planningClient";
import { predictionErrorMessage } from "@/lib/planningClient";
import {
  areaLabel,
  climateSourceSummary,
  formatApiMonth,
  formatDay,
  periodDescription,
  periodTitle,
  type PlanningSelection,
} from "./planningWireframe";
import styles from "./PlanningResult.module.css";

type Props = {
  selection: PlanningSelection;
  areas: GeographyRecord[];
  options: PlanningOptions | null;
  run: PredictionRequest;
  history: PredictionSummary[];
  error: string | null;
  onSelectRun: (run: PredictionSummary) => void;
  onNewPlan: () => void;
};

export function PlanningResult({
  selection,
  areas,
  options,
  run,
  history,
  error,
  onSelectRun,
  onNewPlan,
}: Props) {
  const climate = run.result?.climate ?? run.climate;
  const orderedClimate = [...climate].sort((left, right) =>
    left.month.localeCompare(right.month),
  );
  const modelClimate = [...orderedClimate].reverse();
  const prediction = run.result?.prediction ?? null;
  const climateReady =
    climate.length === 3 && climate.every((month) => month.temperature_c !== null);
  const waiting = run.status === "waiting";
  const running = run.status === "queued" || run.status === "running";
  const dateDescription =
    orderedClimate.length === 3
      ? orderedClimate.map((month) => formatApiMonth(month.month)).join(" · ")
      : periodDescription(selection, options);

  return (
    <div className={styles.wrap}>
      <div className={styles.topbar}>
        <div>
          <div className={styles.eyebrow}>
            {waiting
              ? "Plan saved"
              : run.status === "completed"
                ? "Plan ready"
                : run.status === "failed"
                  ? "Needs attention"
                  : "Plan running"}
          </div>
          <h1>{areaLabel(selection.area, areas)}</h1>
          <p>
            {periodTitle(selection.period)} · {dateDescription || "Checking dates…"}
          </p>
        </div>
        <Button
          variant="secondary"
          leadingIcon={<Icon name="arrow-left" size={14} />}
          onClick={onNewPlan}
        >
          Change plan
        </Button>
      </div>

      <ol className={styles.progress} aria-label="Plan progress">
        <li data-complete="true">
          <Icon name="check" size={13} />
          Period selected
        </li>
        <li data-complete={climateReady}>
          {climateReady ? <Icon name="check" size={13} /> : <span>2</span>}
          Three temperatures checked
        </li>
        <li data-complete={run.status === "completed"}>
          {run.status === "completed" ? (
            <Icon name="check" size={13} />
          ) : (
            <span>3</span>
          )}
          Planning result
        </li>
      </ol>

      {waiting ? (
        <section className={styles.waiting}>
          <div className={styles.waitingIcon}>
            <Icon name="bookmark" size={20} />
          </div>
          <div>
            <h2>Your next-hot-season plan is saved</h2>
            <p>
              CHART will retrieve the three temperatures and run the cumulative model
              {run.available_from
                ? ` from ${formatDay(run.available_from)}`
                : " when the required forecast is published"}
              .
            </p>
          </div>
        </section>
      ) : null}

      {running ? (
        <section className={styles.running} aria-live="polite">
          <span />
          <div>
            <strong>{stageLabel(run.stage)}</strong>
            <p>This page updates automatically. The request is safely saved.</p>
          </div>
        </section>
      ) : null}

      {error || run.status === "failed" ? (
        <div className={styles.error} role="alert">
          {error ?? predictionErrorMessage(run.error_code)}
        </div>
      ) : null}

      {prediction ? <PlanningOutput prediction={prediction} /> : null}

      {orderedClimate.length > 0 ? (
        <details className={styles.dataDetails}>
          <summary className={styles.dataSummary}>
            <div>
              <span>Data used</span>
              <strong>Three monthly climate records</strong>
            </div>
            <div>
              <small>
                {climateSourceSummary(orderedClimate) || "Climate source pending"}
              </small>
              <em>View temperatures and source details</em>
            </div>
          </summary>

          <div className={styles.inputGrid}>
            <section className={styles.temperaturePanel}>
              <div className={styles.sectionHeading}>
                <div>
                  <span>Temperature input</span>
                  <h2>The three months CHART retrieved</h2>
                </div>
                <small>Monthly average of each day&apos;s maximum temperature.</small>
              </div>

              <div className={styles.months}>
                {orderedClimate.map((month) => (
                  <article key={month.month} className={styles.month}>
                    <div className={styles.monthTopline}>
                      <span>{formatApiMonth(month.month)}</span>
                      <small>{sourceKind(month.source_class)}</small>
                    </div>
                    <strong>
                      {month.temperature_c === null
                        ? "Waiting"
                        : `${month.temperature_c.toFixed(1)}°C`}
                    </strong>
                    <p>{month.source_name ?? month.expected_source_name}</p>
                    {month.source_issue_time ? (
                      <small>Issued {formatDay(month.source_issue_time)}</small>
                    ) : null}
                    {month.downloaded_at ? (
                      <small>Downloaded {formatDay(month.downloaded_at)}</small>
                    ) : null}
                    {month.raw_file_hash ? (
                      <small>Saved record {month.raw_file_hash.slice(0, 10)}…</small>
                    ) : null}
                    {month.scenario ? (
                      <small>{scenarioLabel(month.scenario)}</small>
                    ) : null}
                    {month.ensemble_summary ? (
                      <small>{month.ensemble_summary}</small>
                    ) : null}
                    {month.source_uri ? (
                      <a href={month.source_uri} target="_blank" rel="noreferrer">
                        View source
                      </a>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>

            <aside className={styles.modelInput}>
              <span>What enters the model</span>
              <h2>Three values, kept separate</h2>
              <ol>
                {modelClimate.map((month, index) => (
                  <li key={month.month}>
                    <span>{index + 1}</span>
                    <div>
                      <strong>
                        {month.temperature_c === null
                          ? "Waiting"
                          : `${month.temperature_c.toFixed(1)}°C`}
                      </strong>
                      <small>{formatApiMonth(month.month)}</small>
                    </div>
                  </li>
                ))}
              </ol>
              <p>
                The latest month goes first. The model combines all three values into
                one cumulative result; CHART does not average them into one temperature.
              </p>
            </aside>
          </div>
        </details>
      ) : null}

      {prediction ? (
        <section className={styles.record}>
          <span>Data and model record</span>
          <dl>
            <div>
              <dt>Area model</dt>
              <dd>
                {prediction.area} DLNM · version {prediction.model_version}
              </dd>
            </div>
            <div>
              <dt>Temperature input</dt>
              <dd>Three monthly values · latest month first</dd>
            </div>
            {prediction.model_sha256 ? (
              <div>
                <dt>Model artifact</dt>
                <dd title={prediction.model_sha256}>
                  SHA-256 {prediction.model_sha256.slice(0, 12)}…
                </dd>
              </div>
            ) : null}
            <div>
              <dt>Climate source</dt>
              <dd>{climateSourceSummary(orderedClimate)}</dd>
            </div>
            <div>
              <dt>Request</dt>
              <dd>
                {run.request_id}
                {run.dagster_run_id
                  ? ` · data run ${run.dagster_run_id.slice(0, 8)}`
                  : ""}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      {history.length > 0 ? (
        <section className={styles.history} aria-label="Recent planning checks">
          <div>
            <span>Recent checks</span>
            <small>Saved automatically</small>
          </div>
          <div className={styles.historyList}>
            {history.map((item) => (
              <button
                key={item.request_id}
                type="button"
                aria-pressed={item.request_id === run.request_id}
                onClick={() => onSelectRun(item)}
              >
                <span>
                  <strong>{planningTargetLabel(item.planning_target)}</strong>
                  <small>
                    Request {item.request_id} · {formatDay(item.created_at)}
                  </small>
                </span>
                <em data-status={item.status}>{item.status}</em>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function PlanningOutput({ prediction }: { prediction: LbwPrediction }) {
  const difference = Math.round(Math.abs(prediction.odds_ratio - 1) * 100);
  const direction = prediction.odds_ratio >= 1 ? "higher" : "lower";
  const crossesOne = prediction.ci95_low <= 1 && prediction.ci95_high >= 1;
  const signalTitle = crossesOne
    ? "Possible change, but uncertain"
    : prediction.odds_ratio > 1
      ? "Higher-odds signal"
      : prediction.odds_ratio < 1
        ? "Lower-odds signal"
        : "No change from the reference";

  return (
    <section className={styles.output}>
      <div className={styles.sectionHeading}>
        <div>
          <span>Planning result</span>
          <h2>Is there a low-birth-weight concern?</h2>
        </div>
        <small>One cumulative result for the selected three-month period.</small>
      </div>

      <div className={styles.resultLayout}>
        <div className={styles.signal}>
          <span>{signalTitle}</span>
          <strong>{difference}%</strong>
          <p>{direction} odds than the model&apos;s reference temperature</p>
        </div>

        <div className={styles.resultDetails}>
          <dl>
            <div>
              <dt>Odds ratio</dt>
              <dd>{prediction.odds_ratio.toFixed(2)}×</dd>
            </div>
            <div>
              <dt>95% confidence interval</dt>
              <dd>
                {prediction.ci95_low.toFixed(2)}–{prediction.ci95_high.toFixed(2)}
              </dd>
            </div>
            <div>
              <dt>Reference temperature</dt>
              <dd>{prediction.reference_temperature_c.toFixed(1)}°C</dd>
            </div>
          </dl>
          <p data-uncertain={crossesOne}>
            {crossesOne
              ? "The range includes 1, so the model does not show a clear increase or decrease."
              : `The full range stays ${prediction.odds_ratio >= 1 ? "above" : "below"} 1, so the direction is clear in this model result.`}
          </p>
        </div>
      </div>

      <div className={styles.guide}>
        <strong>Quick guide</strong>
        <span>1.00× = same odds as the reference</span>
        <span>1.10× = 10% higher odds</span>
        <span>0.90× = 10% lower odds</span>
        <small>
          This is a population-level association, not an individual diagnosis or a count
          of affected births.
        </small>
      </div>
      {prediction.warning ? (
        <p className={styles.warning}>{prediction.warning}</p>
      ) : null}
    </section>
  );
}

function sourceKind(value: string | null) {
  if (value === "observed") return "Historical";
  if (value === "seasonal") return "Seasonal forecast";
  if (value === "projection") return "Long-term projection";
  return "Climate input";
}

function scenarioLabel(value: string) {
  if (value === "ssp126") return "Lower emissions (SSP1-2.6)";
  if (value === "ssp370") return "High emissions (SSP3-7.0)";
  if (value === "ssp585") return "Very high emissions (SSP5-8.5)";
  return value;
}

function stageLabel(value: string) {
  if (value === "queued") return "Queued";
  if (value === "preparing_climate") return "Retrieving climate data";
  if (value === "climate_ready") return "Three temperatures checked";
  if (value === "predicting") return "Running the model";
  return "Checking the plan";
}

function planningTargetLabel(value: string) {
  if (value === "next_three_months") return "Next three months";
  if (value === "next_heat_season") return "Next hot season";
  if (value === "long_term_hot_season") return "Long-term hot season";
  return "Chosen period";
}
