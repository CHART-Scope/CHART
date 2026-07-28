import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { IconArray } from ".";

const meta: Meta<typeof IconArray> = {
  title: "Composites/IconArray",
  component: IconArray,
};
export default meta;
type Story = StoryObj<typeof IconArray>;

export const Twelve: Story = {
  args: { value: 12, captionSuffix: "increase in odds of LBW" },
};
export const TwentySix: Story = {
  args: { value: 26, captionSuffix: "increase in odds of LBW" },
};
