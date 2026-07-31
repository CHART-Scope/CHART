"use client";

import { useCallback } from "react";

import { Button } from "@/components/Button";
import {
  ConfidenceBandChart,
  type ChartSeries,
} from "@/components/ConfidenceBandChart";
import {
  fetchLongTermRisk,
  type LongTermRiskResponse,
  type LongTermScenarioBlock,
} from "@/lib/dashboardClient";

import styles from "./LongTermView.module.css";
import { useHorizonView } from "./useHorizonView";

const SCENARIO_COLOR: Record<string, string> = {
  rcp26: "#4b8b3b",
  rcp45: "#3a6bc0",
  rcp60: "#c04747",
  rcp85: "#8a3131",
};

const HORIZON_LABEL: Record<string, string> = {
  y5: "In 5 years",
  y15: "In 15 years",
  y25: "In 25 years",
};

const LONG_TERM_POLL_MS = 30_000;

type Props = {
  geographyId: string;
  adminUnit: string | null;
  accessToken?: string;
  refreshKey?: string | null;
};

export function LongTermView({
  geographyId,
  adminUnit,
  accessToken,
  refreshKey,
}: Props) {
  const fetcher = useCallback(
    () => fetchLongTermRisk(geographyId, adminUnit, accessToken),
    [geographyId, adminUnit, accessToken],
  );

  const { state, retry } = useHorizonView<LongTermRiskResponse>({
    fetcher,
    isEmpty: (payload) =>
      payload.scenarios.every((scenario) => scenario.series.length === 0),
    pollIntervalMs: LONG_TERM_POLL_MS,
    refreshKey,
  });

  return (
    <div className={styles.wrap}>
      <ConfidenceBandChart
        title="Predicted heat attributable LBW cases"
        ariaLabel="Long-term LBW prediction, three RCP scenarios"
        loading={state.status === "loading"}
        series={state.status === "ready" ? buildSeries(state.data) : []}
        yFormat={(value) => `${Math.round(value / 10)}%`}
        emptyState={
          <div className={styles.empty}>
            <p>
              We are preparing your Long-term projections. This usually takes longer
              than the seasonal outlook because the pipeline runs the full ISIMIP
              window.
            </p>
            <Button variant="secondary" size="sm" onClick={retry}>
              Check now
            </Button>
          </div>
        }
      />
      {state.status === "ready" ? <LongTermTable data={state.data} /> : null}
      {state.status === "error" ? (
        <div className={styles.errorRow} role="alert">
          <span>{state.message}</span>
          <Button variant="secondary" size="sm" onClick={retry}>
            Try again
          </Button>
        </div>
      ) : null}
      {state.status === "ready" ? (
        <p className={styles.footnote}>
          All scenarios modeled under {state.data.socioeconomic_baseline.toUpperCase()}
          (Middle of the Road) socioeconomic assumptions.
        </p>
      ) : null}
    </div>
  );
}

function buildSeries(payload: LongTermRiskResponse): ChartSeries[] {
  return payload.scenarios
    .filter((scenario) => scenario.series.length > 0)
    .map((scenario) => ({
      id: scenario.name,
      label: scenario.label,
      color: SCENARIO_COLOR[scenario.name] ?? "#4a4a4a",
      showBand: false,
      points: scenario.series.map((point) => ({
        x: point.valid_month,
        y: point.attributable_fraction_milli,
      })),
    }));
}

function LongTermTable({ data }: { data: LongTermRiskResponse }) {
  const horizons: string[] = Array.from(
    new Set(
      data.scenarios.flatMap((scenario) => scenario.table.map((row) => row.horizon)),
    ),
  ).sort();

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">Scenario</th>
          {horizons.map((horizon) => (
            <th key={horizon} scope="col">
              {HORIZON_LABEL[horizon] ?? horizon}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.scenarios.map((scenario) => (
          <LongTermRow key={scenario.name} scenario={scenario} horizons={horizons} />
        ))}
      </tbody>
    </table>
  );
}

function LongTermRow({
  scenario,
  horizons,
}: {
  scenario: LongTermScenarioBlock;
  horizons: string[];
}) {
  const byHorizon = new Map(scenario.table.map((row) => [row.horizon, row]));
  return (
    <tr>
      <td>
        <span
          aria-hidden
          className={styles.swatch}
          style={{ background: SCENARIO_COLOR[scenario.name] ?? "#4a4a4a" }}
        />
        {scenario.label}
      </td>
      {horizons.map((horizon) => {
        const row = byHorizon.get(horizon);
        return (
          <td key={horizon}>
            {row ? `${Math.round(row.attributable_fraction_milli / 10)}%` : "—"}
          </td>
        );
      })}
    </tr>
  );
}
