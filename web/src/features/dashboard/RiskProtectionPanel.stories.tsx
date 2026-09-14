import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { RiskProtectionPanel } from "./RiskProtectionPanel";

const meta: Meta<typeof RiskProtectionPanel> = {
  title: "Dashboard/RiskProtectionPanel",
  component: RiskProtectionPanel,
  parameters: {
    layout: "padded",
  },
};
export default meta;
type Story = StoryObj<typeof RiskProtectionPanel>;

export const Default: Story = {
  render: () => (
    <div style={{ maxWidth: 380 }}>
      <RiskProtectionPanel />
    </div>
  ),
};
