import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

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

const OUTCOMES = [
  { code: "lbw", label: "low birth weight" },
  { code: "u5m", label: "under-5 mortality" },
] as const;

export const WholeStateDefault: Story = {
  render: () => {
    const [outcome, setOutcome] = useState("lbw");
    return (
      <div style={{ maxWidth: 420 }}>
        <HeatLbwLinkPanel
          stateLabel="Madhya Pradesh (State)"
          outcome={outcome}
          outcomeLabel={
            OUTCOMES.find((entry) => entry.code === outcome)?.label ?? outcome
          }
          outcomes={[...OUTCOMES]}
          onOutcomeChange={setOutcome}
          previewPrediction={{ percent: 11, ci95Low: 0.5, ci95High: 1.5 }}
        />
      </div>
    );
  },
};

export const WithDistrictSwitcher: Story = {
  render: () => {
    const [active, setActive] = useState<string | null>(null);
    const [outcome, setOutcome] = useState("lbw");
    return (
      <div style={{ maxWidth: 420 }}>
        <HeatLbwLinkPanel
          stateLabel="Madhya Pradesh (State)"
          outcome={outcome}
          outcomeLabel={
            OUTCOMES.find((entry) => entry.code === outcome)?.label ?? outcome
          }
          outcomes={[...OUTCOMES]}
          onOutcomeChange={setOutcome}
          previewPrediction={{ percent: 11, ci95Low: 0.5, ci95High: 1.5 }}
          districts={[
            { code: "MP-BAR", name: "Barwani" },
            { code: "MP-BHO", name: "Bhopal" },
            { code: "MP-IND", name: "Indore" },
          ]}
          activeAdminUnitCode={active}
          onAdminUnitChange={setActive}
        />
      </div>
    );
  },
};
