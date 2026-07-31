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

export const Default: Story = {
  render: () => (
    <div style={{ maxWidth: 420 }}>
      <HeatLbwLinkPanel />
    </div>
  ),
};

export const WithDistrictSwitcher: Story = {
  render: () => {
    const [active, setActive] = useState<string>("MP-BAR");
    return (
      <div style={{ maxWidth: 420 }}>
        <HeatLbwLinkPanel
          adminUnits={[
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
