"use client";

import { useCallback } from "react";

import { Button } from "@/components/Button";
import {
  ConfidenceBandChart,
  type ChartPoint,
  type ChartSeries,
} from "@/components/ConfidenceBandChart";
import { StatCardWithBadge } from "@/components/StatCardWithBadge";
import {
  fetchShortTermRisk,
  type HorizonCard,
  type ShortTermRiskResponse,
} from "@/lib/dashboardClient";

import styles from "./ShortTermView.module.css";
import { useHorizonView } from "./useHorizonView";

const HORIZON_LABELS: Record<string, string> = {
  m3: "In 3 months",
  m6: "In 6 months",
};

const SHORT_TERM_POLL_MS = 15_000;

type Props = {
  geographyId: string;
  adminUnit: string | null;
  accessToken?: string;
  refreshKey?: string | null;
};

export function ShortTermView({
  geographyId,
  adminUnit,
  accessToken,
  refreshKey,
}: Props) {
  const fetcher = useCallback(
    () => fetchShortTermRisk(geographyId, adminUnit, accessToken),
    [geographyId, adminUnit, accessToken],
  );

  const { state, retry } = useHorizonView<ShortTermRiskResponse>({
    fetcher,
    isEmpty: (payload) => payload.series.length === 0,
    pollIntervalMs: SHORT_TERM_POLL_MS,
    refreshKey,
  });

  return (
    <div className={styles.wrap}>
      <ConfidenceBandChart
        title="Predicted heat attributable LBW cases"
        ariaLabel="Short-term LBW prediction"
        loading={state.status === "loading"}
        series={state.status === "ready" ? buildSeries(state.data) : []}
        yFormat={(value) => `${Math.round(value / 10)}%`}
        emptyState={
          <div className={styles.empty}>
            <p>
              We are preparing your Short-term forecast. This usually takes a few
              moments.
            </p>
            <Button variant="secondary" size="sm" onClick={retry}>
              Check now
            </Button>
          </div>
        }
      />
      <div className={styles.cardRow}>{renderCards(state)}</div>
      {state.status === "error" ? (
        <div className={styles.errorRow} role="alert">
          <span>{state.message}</span>
          <Button variant="secondary" size="sm" onClick={retry}>
            Try again
          </Button>
        </div>
      ) : null}
      <p className={styles.footnote}>
        The shaded band shows the range of plausible outcomes at each point — it widens
        further out because forecasts naturally become less certain over time.
      </p>
    </div>
  );
}

function buildSeries(payload: ShortTermRiskResponse): ChartSeries[] {
  const map = new Map<string, { color: string; label: string }>([
    ["seas5_ensemble", { color: "#7a1a4a", label: "Seasonal outlook (1-6 mo)" }],
    ["rcp45", { color: "#b26499", label: "Near-term projection (RCP 4.5)" }],
  ]);
  const buffers = new Map<
    string,
    { color: string; label: string; points: ChartPoint[] }
  >();
  for (const point of payload.series) {
    const template = map.get(point.scenario) ?? {
      color: "#4a4a4a",
      label: point.scenario,
    };
    let buffer = buffers.get(point.scenario);
    if (!buffer) {
      buffer = { color: template.color, label: template.label, points: [] };
      buffers.set(point.scenario, buffer);
    }
    buffer.points.push({
      x: point.valid_month,
      y: point.attributable_fraction_milli,
      low: point.rr_ci_low_milli,
      high: point.rr_ci_high_milli,
    });
  }
  return Array.from(buffers.entries()).map(([id, buffer]) => ({
    id,
    label: buffer.label,
    color: buffer.color,
    points: buffer.points,
  }));
}

function renderCards(
  state: ReturnType<typeof useHorizonView<ShortTermRiskResponse>>["state"],
) {
  const skeletonHorizons = ["m3", "m6"];
  if (state.status === "loading" || state.status === "idle") {
    return skeletonHorizons.map((horizon) => (
      <StatCardWithBadge
        key={horizon}
        eyebrow={HORIZON_LABELS[horizon] ?? horizon}
        headline=""
        supporting=""
        precision="moderate"
        loading
      />
    ));
  }
  if (state.status === "empty" || state.status === "error") {
    return skeletonHorizons.map((horizon) => (
      <StatCardWithBadge
        key={horizon}
        eyebrow={HORIZON_LABELS[horizon] ?? horizon}
        headline="—"
        supporting={state.status === "error" ? "unavailable" : "preparing forecast"}
        precision="moderate"
      />
    ));
  }
  const cards = state.data.cards;
  if (cards.length === 0) {
    return skeletonHorizons.map((horizon) => (
      <StatCardWithBadge
        key={horizon}
        eyebrow={HORIZON_LABELS[horizon] ?? horizon}
        headline="—"
        supporting="no rows for this admin unit yet"
        precision="moderate"
      />
    ));
  }
  return cards.map((card) => renderCard(card));
}

function renderCard(card: HorizonCard) {
  const percent = Math.round(card.attributable_fraction_milli / 10);
  const low = Math.round(card.rr_ci_low_milli / 10);
  const high = Math.round(card.rr_ci_high_milli / 10);
  return (
    <StatCardWithBadge
      key={card.horizon}
      eyebrow={HORIZON_LABELS[card.horizon] ?? card.horizon}
      headline={`${percent}%`}
      supporting="heat attributable LBW cases"
      range={`${low}-${high}% range`}
      precision={card.precision}
      precisionLabel={card.precision[0].toUpperCase() + card.precision.slice(1)}
    />
  );
}
