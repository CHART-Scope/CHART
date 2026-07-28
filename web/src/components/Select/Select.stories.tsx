import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Select } from ".";

const meta: Meta<typeof Select> = {
  title: "Primitives/Select",
  component: Select,
  args: {
    label: "Country",
    placeholder: "— Choose a country —",
    options: [
      { value: "india", label: "India" },
      { value: "kenya", label: "Kenya" },
    ],
  },
};
export default meta;
type Story = StoryObj<typeof Select>;

export const Default: Story = {};
export const Filter: Story = {
  args: {
    variant: "filter",
    label: undefined,
    placeholder: undefined,
    options: [
      { value: "all", label: "All solution types" },
      { value: "behaviour", label: "Behaviour change" },
      { value: "environment", label: "Environment" },
      { value: "policy", label: "Policy" },
    ],
  },
};
export const Inline: Story = {
  args: {
    variant: "inline",
    label: undefined,
    placeholder: undefined,
    options: [
      { value: "season", label: "season" },
      { value: "1year", label: "1 year" },
    ],
    defaultValue: "season",
  },
  render: (args) => (
    <p style={{ fontSize: 15, lineHeight: 2 }}>
      We're planning together for the next <Select {...args} />
    </p>
  ),
};
