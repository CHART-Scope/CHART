import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { FilterBar } from "./FilterBar";

function FilterBarStory() {
  const [hazard, setHazard] = useState("heat");
  const [region, setRegion] = useState("western");

  return (
    <FilterBar
      filters={[
        {
          id: "region",
          label: "Region",
          options: [
            { value: "western", label: "Western Province" },
            { value: "central", label: "Central Province" },
            { value: "coastal", label: "Coastal Province" },
          ],
          value: region,
          onChange: setRegion,
        },
        {
          id: "hazard",
          label: "Hazard",
          options: [
            { value: "heat", label: "Extreme heat" },
            { value: "flood", label: "Flooding" },
            { value: "drought", label: "Drought" },
          ],
          value: hazard,
          onChange: setHazard,
        },
      ]}
    />
  );
}

const meta = {
  title: "CHART UI/FilterBar",
  render: () => <FilterBarStory />,
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
