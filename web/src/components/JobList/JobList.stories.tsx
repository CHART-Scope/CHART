import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { IngestionJob } from "@/lib/climateDataClient";

import { JobList } from ".";

/**
 * Background jobs as Settings > Jobs and the top bar's drawer show them:
 * status, where, when, how far, and for a failure why, with a retry.
 */
const meta: Meta<typeof JobList> = {
  title: "Composites/JobList",
  component: JobList,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof JobList>;

const NOW = Date.parse("2026-10-18T10:06:00Z");

function job(overrides: Partial<IngestionJob> = {}): IngestionJob {
  return {
    id: 12,
    country_code: "KE",
    months: ["2025-10", "2026-09"],
    status: "running",
    stage: "writing",
    areas_total: 47,
    areas_done: 18,
    error_code: null,
    created_at: "2026-10-18T10:00:00Z",
    updated_at: "2026-10-18T10:05:30Z",
    completed_at: null,
    ...overrides,
  };
}

const done = job({
  id: 9,
  country_code: "IN",
  status: "completed",
  stage: "completed",
  areas_total: 11,
  areas_done: 11,
  created_at: "2026-10-17T08:00:00Z",
  completed_at: "2026-10-17T08:14:00Z",
});
const failed = job({
  id: 11,
  status: "failed",
  stage: "failed",
  areas_done: 0,
  error_code: "CLIMATE_INGEST_NOT_CONFIGURED",
  created_at: "2026-10-18T09:00:00Z",
  updated_at: "2026-10-18T09:02:00Z",
});

/** A mix: one running with measurable progress, one failure, one finished. */
export const Recent: Story = {
  args: { jobs: [job(), failed, done], now: NOW, onRetry: () => {} },
};

/** Queued: waiting for a Dagster worker, so the bar has no measure yet. */
export const Queued: Story = {
  args: {
    jobs: [job({ status: "queued", stage: "queued", areas_done: 0 })],
    now: NOW,
  },
};

/** Downloading the grid: progress cannot be counted, so the bar sweeps. */
export const Downloading: Story = {
  args: { jobs: [job({ stage: "downloading", areas_done: 0 })], now: NOW },
};

/** A failure names its reason and offers a retry of the same months. */
export const Failed: Story = {
  args: { jobs: [failed], now: NOW, onRetry: () => {}, retryingId: null },
};

/** The narrow, read-only form the top bar's drawer uses. */
export const Compact: Story = {
  args: { jobs: [job(), failed, done], now: NOW, compact: true },
  decorators: [(Story) => <div style={{ maxWidth: 328 }}>{Story()}</div>],
};
