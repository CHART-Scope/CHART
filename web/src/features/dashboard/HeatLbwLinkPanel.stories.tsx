import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { HeatLbwLinkPanel } from "./HeatLbwLinkPanel";

const meta: Meta<typeof HeatLbwLinkPanel> = {
  title: "Dashboard/HeatLbwLinkPanel",
  component: HeatLbwLinkPanel,
  parameters: {
    layout: "padded",
  },
};
export default meta;
type Story = StoryObj<typeof HeatLbwLinkPanel>;

/** Default preview — no OR available, so the panel renders the generic
 * "modelled difference from the reference" line. */
export const Default: Story = {
  render: () => (
    <div style={{ maxWidth: 420 }}>
      <HeatLbwLinkPanel
        placeLabel="Madhya Pradesh"
        outcome="lbw"
        outcomeLabel="low birth weight"
        previewPrediction={{ percent: 11, ci95Low: 0.5, ci95High: 1.5 }}
      />
    </div>
  ),
};

/** Above-reference reading with OR>1 — the expected heat-hazard shape:
 * icon array fills, headline says "X% higher", AF hint below. */
export const AboveReference: Story = {
  render: () => (
    <div style={{ maxWidth: 420 }}>
      <HeatLbwLinkPanel
        placeLabel="Bhopal Division"
        outcome="lbw"
        outcomeLabel="low birth weight"
        previewPrediction={{
          percent: 25,
          oddsRatio: 1.25,
          referenceTemperatureC: 27,
          ci95Low: 1.1,
          ci95High: 1.42,
        }}
      />
    </div>
  ),
};

/** Above-reference with OR<1 — small-sample spline oddity (e.g. Bhopal
 * at 38.5°C). Headline should say "no heat-attributable excess" while
 * the secondary line shows the raw signed odds change in teal so the
 * reader notices the unusual direction. */
export const AboveReferenceOddsBelowOne: Story = {
  render: () => (
    <div style={{ maxWidth: 420 }}>
      <HeatLbwLinkPanel
        placeLabel="Bhopal Division"
        outcome="lbw"
        outcomeLabel="low birth weight"
        previewPrediction={{
          percent: -50,
          oddsRatio: 0.5,
          referenceTemperatureC: 27,
          ci95Low: 0.17,
          ci95High: 1.43,
        }}
      />
    </div>
  ),
};

/** Below-reference with positive_excess_only clamp — headline shows the
 * "at or below the reference" copy; secondary is suppressed. */
export const BelowReference: Story = {
  render: () => (
    <div style={{ maxWidth: 420 }}>
      <HeatLbwLinkPanel
        placeLabel="Madhya Pradesh"
        outcome="lbw"
        outcomeLabel="low birth weight"
        previewPrediction={{
          percent: 0,
          oddsRatio: 0.9,
          referenceTemperatureC: 27,
          ci95Low: 0.8,
          ci95High: 1.0,
        }}
      />
    </div>
  ),
};
