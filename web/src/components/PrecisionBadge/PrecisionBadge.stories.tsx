import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { PrecisionBadge } from ".";

const meta: Meta<typeof PrecisionBadge> = {
  title: "Primitives/PrecisionBadge",
  component: PrecisionBadge,
};
export default meta;
type Story = StoryObj<typeof PrecisionBadge>;

export const High: Story = { args: { level: "high" } };
export const Moderate: Story = { args: { level: "moderate" } };
export const Low: Story = { args: { level: "low" } };
