import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { OptionCard } from "./OptionCard";

const meta = {
  title: "UI/Option Card",
  component: OptionCard,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof OptionCard>;

export default meta;

type Story = StoryObj<typeof meta>;

const leafIcon = (
  <svg aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      d="M5 19c8 0 14-6 14-14-8 0-14 6-14 14Zm0 0c0-4 2-8 6-10"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.6}
    />
  </svg>
);

export const Compact: Story = {
  args: {
    label: "Extreme heat",
    icon: leafIcon,
    selected: false,
    onToggle: () => undefined,
  },
  render: () => <OptionCardPreview />,
};

export const Detailed: Story = {
  args: {
    label: "Public health",
    description: "Heat-health action plans, disease surveillance, and care access.",
    icon: leafIcon,
    selected: true,
    onToggle: () => undefined,
  },
};

function OptionCardPreview() {
  const [selected, setSelected] = useState(false);

  return (
    <OptionCard
      icon={leafIcon}
      label="Extreme heat"
      selected={selected}
      onToggle={() => setSelected((current) => !current)}
    />
  );
}
