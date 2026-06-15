import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Select } from "./Select";

const options = [
  { value: "kenya", label: "Kenya" },
  { value: "india", label: "India" },
  { value: "nepal", label: "Nepal" },
];

const meta = {
  title: "UI/Select",
  component: Select,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof Select>;

export default meta;

type Story = StoryObj<typeof meta>;

export const WithLabel: Story = {
  args: {
    label: "Country",
    options,
    placeholder: "Choose a country",
    value: "",
    onChange: () => undefined,
  },
  render: () => <SelectPreview />,
};

export const Disabled: Story = {
  args: {
    label: "Jurisdiction level",
    options,
    placeholder: "Select a country first",
    value: "",
    disabled: true,
    onChange: () => undefined,
  },
};

function SelectPreview() {
  const [value, setValue] = useState("");

  return (
    <Select
      label="Country"
      options={options}
      placeholder="Choose a country"
      value={value}
      onChange={(event) => setValue(event.target.value)}
    />
  );
}
