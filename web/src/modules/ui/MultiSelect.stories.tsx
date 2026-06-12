import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { MultiSelect } from "./MultiSelect";

const options = [
  { id: "extreme-heat", label: "Extreme heat" },
  { id: "floods", label: "Floods" },
  { id: "drought", label: "Drought" },
  { id: "storm", label: "Storm" },
];

const meta = {
  title: "UI/Multi Select",
  component: MultiSelect,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof MultiSelect>;

export default meta;

type Story = StoryObj<typeof meta>;

export const FilterMenu: Story = {
  args: {
    id: "hazards-story",
    isOpen: true,
    label: "Climate hazard",
    options,
    selectedIds: ["extreme-heat"],
    onChange: () => undefined,
    onOpenChange: () => undefined,
  },
  render: () => <MultiSelectPreview />,
};

function MultiSelectPreview() {
  const [selectedIds, setSelectedIds] = useState(["extreme-heat"]);
  const [isOpen, setIsOpen] = useState(true);

  return (
    <MultiSelect
      id="hazards-story"
      isOpen={isOpen}
      label="Climate hazard"
      options={options}
      selectedIds={selectedIds}
      onChange={setSelectedIds}
      onOpenChange={setIsOpen}
    />
  );
}
