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

export const WholeStateDefault: Story = {
  render: () => (
    <div style={{ maxWidth: 420 }}>
      <HeatLbwLinkPanel stateLabel="Madhya Pradesh (State)" />
    </div>
  ),
};

export const WithDistrictSwitcher: Story = {
  render: () => {
    const [active, setActive] = useState<string | null>(null);
    return (
      <div style={{ maxWidth: 420 }}>
        <HeatLbwLinkPanel
          stateLabel="Madhya Pradesh (State)"
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
