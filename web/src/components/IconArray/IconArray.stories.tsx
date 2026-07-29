import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { IconSprite } from "../Icon";
import { IconArray } from ".";

const meta: Meta<typeof IconArray> = {
  title: "Composites/IconArray",
  component: IconArray,
  decorators: [
    (Story) => (
      <>
        <IconSprite />
        <Story />
      </>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof IconArray>;

export const Twelve: Story = {
  args: {
    value: 12,
    figure: "mother-baby",
    captionSuffix: "increase in odds of LBW",
  },
};
export const TwentySix: Story = {
  args: {
    value: 26,
    figure: "mother-baby",
    captionSuffix: "increase in odds of LBW",
  },
};
export const MotherBabyMaternalHeat: Story = {
  args: {
    value: 25,
    figure: "mother-baby",
    captionSuffix: "maternal heat exposure",
  },
};
