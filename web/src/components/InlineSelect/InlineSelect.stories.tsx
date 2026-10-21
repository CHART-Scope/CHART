import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { InlineSelect } from ".";

const hazards = [
  { value: "heat", label: "Extreme heat" },
  { value: "flood", label: "Flooding" },
];
const outcomes = [
  { value: "lbw", label: "Low birth weight" },
  { value: "under_five_mortality", label: "Under-five mortality" },
];

/** The app's one select: the plan page's sentence pill. Every dropdown is
 * this control; `size="sm"` is the same design for dense rows. */
const meta: Meta<typeof InlineSelect> = {
  title: "Primitives/InlineSelect",
  component: InlineSelect,
  args: { "aria-label": "Climate hazard", options: hazards, value: "heat" },
  render: function Render(args) {
    const [value, setValue] = useState(args.value);
    return <InlineSelect {...args} value={value} onChange={setValue} />;
  },
};
export default meta;
type Story = StoryObj<typeof InlineSelect>;

export const Default: Story = {};

export const Labelled: Story = {
  args: { label: "Climate hazard" },
};

export const Small: Story = {
  args: { size: "sm", "aria-label": "Year", label: undefined },
};

export const InASentence: Story = {
  render: function Render() {
    const [hazard, setHazard] = useState("heat");
    const [outcome, setOutcome] = useState("lbw");
    return (
      <p style={{ fontSize: 17, lineHeight: 2.1, maxWidth: 760 }}>
        We&apos;re planning together for the impacts of{" "}
        <InlineSelect
          aria-label="Choose the climate hazard"
          value={hazard}
          onChange={setHazard}
          options={hazards}
        />{" "}
        focusing on{" "}
        <InlineSelect
          aria-label="Choose the health outcome"
          value={outcome}
          onChange={setOutcome}
          options={outcomes}
        />{" "}
        in Kenya.
      </p>
    );
  },
};

/** The dashboard's topic pickers: labelled pills stretched across the row. */
export const DashboardTopic: Story = {
  render: function Render() {
    const [hazard, setHazard] = useState("heat");
    const [outcome, setOutcome] = useState("lbw");
    return (
      <div style={{ display: "flex", gap: 16, width: 720 }}>
        <div style={{ flex: 1, display: "grid" }}>
          <InlineSelect
            label="Climate hazard"
            aria-label="Climate hazard"
            value={hazard}
            onChange={setHazard}
            options={hazards}
            style={{ width: "100%", margin: 0 }}
          />
        </div>
        <div style={{ flex: 1.6, display: "grid" }}>
          <InlineSelect
            label="Health outcome"
            aria-label="Health outcome"
            value={outcome}
            onChange={setOutcome}
            options={outcomes}
            style={{ width: "100%", margin: 0 }}
          />
        </div>
      </div>
    );
  },
};

export const Searchable: Story = {
  args: {
    label: "County",
    "aria-label": "County",
    value: "Nairobi",
    options: [
      "Baringo",
      "Bomet",
      "Bungoma",
      "Busia",
      "Garissa",
      "Kakamega",
      "Kiambu",
      "Nairobi",
      "Nakuru",
    ].map((label) => ({ value: label, label })),
  },
};

export const Disabled: Story = { args: { disabled: true } };
