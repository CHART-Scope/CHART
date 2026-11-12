import type { Meta, StoryObj } from "@storybook/react";

import type { CountryCoverage, IngestionJob } from "@/lib/climateDataClient";

import { ClimateDataTable } from "./ClimateDataCard";
import { SettingsCard } from "./SettingsCard";

/**
 * Settings > Data: one row per country with what is held and its latest pull.
 *
 * Rendered from fixtures so every state is reachable without a database —
 * including the two that are hard to catch by hand: a pull in progress, and a
 * pull that failed (whose reason and retry live in the Jobs tab).
 */
const meta = {
  title: "Planning/ClimateDataCard",
  component: ClimateDataTable,
  parameters: { layout: "padded" },
  render: (args) => (
    <SettingsCard eyebrow="Climate data" title="Observations held per country">
      <ClimateDataTable {...args} />
    </SettingsCard>
  ),
} satisfies Meta<typeof ClimateDataTable>;

export default meta;
type Story = StoryObj<typeof meta>;

function coverage(): CountryCoverage[] {
  return [
    {
      country_code: "IN",
      name: "India",
      areas_total: 11,
      areas_with_data: 11,
      months: 15,
      earliest: "2025-04-01",
      latest: "2026-08-01",
      areas: [
        {
          geography_id: "g1",
          admin_unit_id: 1,
          code: "bhopal",
          name: "Bhopal Division",
          months: 15,
          earliest: "2025-04-01",
          latest: "2026-08-01",
        },
        {
          geography_id: "g2",
          admin_unit_id: 2,
          code: "rewa",
          name: "Rewa Division",
          months: 15,
          earliest: "2025-04-01",
          latest: "2026-08-01",
        },
      ],
    },
    {
      country_code: "KE",
      name: "Kenya",
      areas_total: 47,
      areas_with_data: 44,
      months: 10,
      earliest: "2025-11-01",
      latest: "2026-08-01",
      areas: [
        {
          geography_id: "g3",
          admin_unit_id: 3,
          code: "kajiado",
          name: "Kajiado",
          months: 10,
          earliest: "2025-11-01",
          latest: "2026-08-01",
        },
        {
          geography_id: "g4",
          admin_unit_id: 4,
          code: "turkana",
          name: "Turkana",
          months: 0,
          earliest: null,
          latest: null,
        },
      ],
    },
  ];
}

function job(overrides: Partial<IngestionJob> = {}): IngestionJob {
  return {
    id: 1,
    country_code: "KE",
    months: ["2026-08"],
    status: "running",
    stage: "writing",
    areas_total: 47,
    areas_done: 12,
    error_code: null,
    created_at: "2026-09-18T10:00:00Z",
    updated_at: "2026-09-18T10:02:00Z",
    completed_at: null,
    ...overrides,
  };
}

const onPull = () => {};

/** The ordinary case: both countries covered, nothing running. */
export const Covered: Story = { args: { coverage: coverage(), jobs: [], onPull } };

/**
 * A pull in progress. Areas rather than a percentage, because a country of 47
 * needs to look like it is moving and the denominator is recognisable.
 */
export const Pulling: Story = { args: { coverage: coverage(), jobs: [job()], onPull } };

/** A failure reaches the row, with a retry and a link to its reason in Jobs. */
export const LastPullFailed: Story = {
  args: {
    coverage: coverage(),
    jobs: [
      job({
        status: "failed",
        stage: "failed",
        error_code: "CLIMATE_INGEST_NOT_CONFIGURED",
      }),
    ],
    onPull,
  },
};

/** A fresh install: nothing held anywhere, everything pullable. */
export const NothingPulledYet: Story = {
  args: {
    coverage: coverage().map((country) => ({
      ...country,
      areas_with_data: 0,
      months: 0,
      earliest: null,
      latest: null,
      areas: country.areas.map((area) => ({
        ...area,
        months: 0,
        earliest: null,
        latest: null,
      })),
    })),
    jobs: [],
    onPull,
  },
};
