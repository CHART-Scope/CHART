import { IconSprite } from "@/components/Icon";

import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { HeatLbwLinkPanel } from "./HeatLbwLinkPanel";

const meta: Meta<typeof HeatLbwLinkPanel> = {
  title: "Dashboard/HeatLbwLinkPanel",
  component: HeatLbwLinkPanel,
  decorators: [
    (Story) => (
      <>
        <IconSprite />
        <Story />
      </>
    ),
  ],
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

/**
 * A month the model attributes nothing to. The sentence must read "no
 * attributable cases" rather than "0%", which would say heat is safe here —
 * and the pictogram must be empty to match. Agreed on the 17 Sep call.
 */
export const NoAttributableCases: Story = {
  render: () => (
    <div style={{ maxWidth: 420 }}>
      <HeatLbwLinkPanel
        placeLabel="Bhopal Division"
        outcome="lbw"
        outcomeLabel="low birth weight"
        previewPrediction={{
          percent: -44,
          oddsRatio: 0.56,
          referenceTemperatureC: 27,
          ci95Low: 0.22,
          ci95High: 1.39,
        }}
      />
    </div>
  ),
};

/**
 * Under-five mortality, showing the same panel carrying a different outcome
 * label and an MMT-worded reference clause rather than a plain reference.
 */
export const UnderFiveMortality: Story = {
  render: () => (
    <div style={{ maxWidth: 420 }}>
      <HeatLbwLinkPanel
        placeLabel="Kajiado"
        outcome="under_5_mortality"
        outcomeLabel="under-five mortality"
        figure="baby"
        previewPrediction={{
          percent: 21,
          oddsRatio: 1.27,
          referenceTemperatureC: 28.73,
          ci95Low: 0.66,
          ci95High: 2.44,
        }}
      />
    </div>
  ),
};
