import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { KpiCard } from "./KpiCard";

const meta = {
  title: "CHART UI/KpiCard",
  component: KpiCard,
  args: {
    label: "Heat risk index",
    value: "74",
    detail: "12% increase this quarter",
    trend: "up",
  },
  argTypes: {
    trend: {
      control: "select",
      options: ["up", "down", "neutral"],
    },
  },
} satisfies Meta<typeof KpiCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const IncreasedRisk: Story = {};

export const Improving: Story = {
  args: {
    label: "Prepared facilities",
    value: "62%",
    detail: "8% improvement",
    trend: "down",
    accentColor: "var(--green)",
  },
};

export const Neutral: Story = {
  args: {
    label: "Open planning actions",
    value: "18",
    detail: "No change this week",
    trend: "neutral",
    accentColor: "var(--teal)",
  },
};
