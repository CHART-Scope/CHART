import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StatCardWithBadge } from ".";

const meta: Meta<typeof StatCardWithBadge> = {
  title: "Composites/StatCardWithBadge",
  component: StatCardWithBadge,
};
export default meta;
type Story = StoryObj<typeof StatCardWithBadge>;

export const ThreeMonths: Story = {
  args: {
    eyebrow: "In 3 months",
    headline: "15%",
    supporting: "heat attributable LBW cases",
    range: "13-17% range",
    precision: "moderate",
    precisionLabel: "Moderate",
  },
};

export const SixMonths: Story = {
  args: {
    eyebrow: "In 6 months",
    headline: "18%",
    supporting: "heat attributable LBW cases",
    range: "12-24% range",
    precision: "low",
    precisionLabel: "Low",
  },
};

export const Loading: Story = {
  args: {
    eyebrow: "In 3 months",
    headline: "",
    supporting: "",
    precision: "moderate",
    loading: true,
  },
};
