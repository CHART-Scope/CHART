import type { Meta, StoryObj } from "@storybook/react";

import type { CountryCoverage, IngestionJob } from "@/lib/climateDataClient";

import { ClimateDataCard } from "./ClimateDataCard";

/**
 * The Settings section for climate data.
 *
 * Rendered from fixtures so every state is reachable without a database —
 * including the two that are hard to catch by hand: a pull in progress, and a
 * pull that failed.
 */
const meta = {
  title: "Planning/ClimateDataCard",
  component: ClimateDataCard,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ClimateDataCard>;

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

/** Stubs both endpoints so the card renders from fixtures, not the network. */
function withData(countries: CountryCoverage[], jobs: IngestionJob[]) {
  return function Wrapped(args: React.ComponentProps<typeof ClimateDataCard>) {
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes("ingestion-jobs") ? jobs : countries;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    queueMicrotask(() => {
      globalThis.fetch = original;
    });
    return <ClimateDataCard {...args} />;
  };
}

const args = { accessToken: "story-token" };

/** The ordinary case: both countries covered, nothing running. */
export const Covered: Story = { args, render: withData(coverage(), []) };

/**
 * A pull in progress. Areas rather than a percentage, because a country of 47
 * needs to look like it is moving and the denominator is recognisable.
 */
export const Pulling: Story = { args, render: withData(coverage(), [job()]) };

/** A failure has to reach the row rather than disappearing into a log. */
export const LastPullFailed: Story = {
  args,
  render: withData(coverage(), [
    job({
      status: "failed",
      stage: "failed",
      error_code: "CLIMATE_INGEST_NOT_CONFIGURED",
    }),
  ]),
};

/** A fresh install: nothing held anywhere, everything pullable. */
export const NothingPulledYet: Story = {
  args,
  render: withData(
    coverage().map((country) => ({
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
    [],
  ),
};
