import { useLayoutEffect, useState } from "react";

import type { Meta, StoryObj } from "@storybook/react";

import { type MapResponse } from "@/lib/dashboardClient";

import { ScienceVideoPlaceholder } from "./ScienceVideoPlaceholder";
import { SpatialRiskMap } from "./SpatialRiskMap";
import { HeatLbwLinkPanel } from "./HeatLbwLinkPanel";
import { RiskProtectionPanel } from "./RiskProtectionPanel";
import { IconSprite } from "@/components/Icon";
import layout from "@/app/dashboard/[geo]/page.module.css";

/**
 * The third dashboard card: where the risk sits.
 *
 * These stories render from fixtures rather than the API, so the states that
 * matter can be inspected without a database — in particular the one that is
 * easy to get wrong: an area with no fitted model must be drawn, hatched,
 * rather than left out. A map that omits uncovered districts reads as though
 * those places carry no risk.
 */
const meta = {
  title: "Dashboard/SpatialRiskMap",
  component: SpatialRiskMap,
  parameters: { layout: "padded" },
} satisfies Meta<typeof SpatialRiskMap>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A coarse three-by-two grid of square "divisions", enough to read the shading. */
function fixture(
  values: (number | null)[],
  reasons: (string | null)[] = [],
): MapResponse {
  const names = ["Bhopal", "Gwalior", "Chambal", "Indore", "Jabalpur", "Rewa"];
  return {
    geography_id: "geo-in-madhya-pradesh",
    outcome: "lbw",
    month: "2026-08",
    metric: "attributable_fraction",
    unit: "percent",
    bounds: [74, 21, 82, 27],
    simplify_tolerance_degrees: 0.01,
    areas: names.map((name, index) => {
      const column = index % 3;
      const row = Math.floor(index / 3);
      const west = 74 + column * 2.6;
      const south = 21 + row * 2.9;
      return {
        geography_id: `geo-in-mp-${name.toLowerCase()}`,
        admin_unit_id: index + 1,
        code: name.toLowerCase(),
        name: `${name} Division`,
        level: "division",
        value_percent: values[index] ?? null,
        missing_reason:
          values[index] == null ? (reasons[index] ?? "no_prediction") : null,
        odds_ratio: values[index] == null ? null : 1.2,
        on_training_support: true,
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [west, south],
              [west + 2.4, south],
              [west + 2.4, south + 2.7],
              [west, south + 2.7],
              [west, south],
            ],
          ],
        },
      };
    }),
  };
}

function withFixture(response: MapResponse, combined = false) {
  return function Wrapped(args: React.ComponentProps<typeof SpatialRiskMap>) {
    const [month, setMonth] = useState("2026-08");
    // The component fetches through dashboardClient; stories stub that call so
    // the drawing, not the network, is what is under inspection.
    useLayoutEffect(() => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async () =>
        new Response(JSON.stringify(response), {
          status: 200,
          headers: { "content-type": "application/json" },
        })) as typeof fetch;
      return () => {
        globalThis.fetch = originalFetch;
      };
    }, []);
    if (!combined) return <SpatialRiskMap {...args} />;
    return (
      <>
        <IconSprite />
        <div className={layout.grid}>
          <aside className={layout.learning}>
            <ScienceVideoPlaceholder />
            <RiskProtectionPanel outcomeLabel="low birth weight" />
          </aside>
          <HeatLbwLinkPanel
            placeLabel="Madhya Pradesh"
            month={month}
            onMonthChange={setMonth}
            previewPrediction={{
              percent: 27,
              oddsRatio: 1.37,
              ci95Low: 0.7,
              ci95High: 2.4,
              referenceTemperatureC: 30,
            }}
          >
            <SpatialRiskMap {...args} embedded month={month} />
          </HeatLbwLinkPanel>
        </div>
      </>
    );
  };
}

const baseArgs = {
  geographyId: "geo-in-madhya-pradesh",
  accessToken: "story-token",
  month: "2026-08",
  outcome: "lbw",
};

/** The ordinary case: a spread of values across the amber-to-red ramp. */
export const Shaded: Story = {
  args: { ...baseArgs, selectedGeographyId: "geo-in-mp-bhopal" },
  render: withFixture(fixture([3, 9, 17, 24, 13, 6])),
};

/**
 * The rule the map exists to keep, and the distinction between the two kinds
 * of absence. Turkana is the real case for "not integrated": Kenya's LBW
 * release has no North-western block, so no model was ever fitted there.
 * "Not run yet" is different - the model exists, the month simply has not
 * been calculated - and a planner can fix that themselves.
 */
export const UncoveredAreasAreDrawnNotDropped: Story = {
  args: baseArgs,
  render: withFixture(
    fixture(
      [3, null, 17, null, 13, null],
      [null, "no_model", null, "no_prediction", null, "no_model"],
    ),
  ),
};

/** Nothing computed yet — every area hatched, and the readout says so. */
export const NothingCalculatedYet: Story = {
  args: baseArgs,
  render: withFixture(
    fixture([null, null, null, null, null, null], Array(6).fill("no_prediction")),
  ),
};

/**
 * A quiet month must look quiet. The bands are fixed rather than fitted to
 * what is on screen, so every area here lands in the palest band instead of
 * the worst one rendering as though it were the worst on record.
 */
export const AQuietMonthStaysPale: Story = {
  args: baseArgs,
  render: withFixture(fixture([1, 2, 3, 2, 1, 2])),
};

/**
 * One area per band, so the legend can be checked against the map.
 * Upper boundaries are inclusive: 15% belongs to "10–15%".
 */
export const EveryBand: Story = {
  args: baseArgs,
  render: withFixture(fixture([0, 5, 10, 15, 15.1, null])),
};

export const CombinedDashboard: Story = {
  args: baseArgs,
  render: withFixture(fixture([3, 9, 17, null, 13, 6]), true),
};
