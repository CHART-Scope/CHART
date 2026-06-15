import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { SearchableSelect } from "./SearchableSelect";

const options = [
  { id: "kajiado", label: "Kajiado", keywords: "County" },
  { id: "kisumu", label: "Kisumu", keywords: "County" },
  { id: "mombasa", label: "Mombasa", keywords: "County" },
  { id: "nairobi", label: "Nairobi", keywords: "County" },
];

const meta = {
  title: "UI/Searchable Select",
  component: SearchableSelect,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof SearchableSelect>;

export default meta;

type Story = StoryObj<typeof meta>;

export const GeographyPicker: Story = {
  args: {
    emptyLabel: "No matching counties.",
    label: "County",
    options,
    placeholder: "Search counties",
    query: "",
    selectedId: "kajiado",
    onQueryChange: () => undefined,
    onSelect: () => undefined,
  },
  render: () => <SearchableSelectPreview />,
};

function SearchableSelectPreview() {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("kajiado");

  return (
    <SearchableSelect
      emptyLabel="No matching counties."
      label="County"
      options={options}
      placeholder="Search counties"
      query={query}
      selectedId={selectedId}
      onQueryChange={setQuery}
      onSelect={(id) => {
        setSelectedId(id);
        setQuery("");
      }}
    />
  );
}
