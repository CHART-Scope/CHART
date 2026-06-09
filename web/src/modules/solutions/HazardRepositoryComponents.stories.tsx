import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { chartRepositoryHazards } from "./chartRepositoryStoryData";
import {
  HazardCard as HazardCardComponent,
  HazardDrawer as HazardDrawerComponent,
  HazardGrid as HazardGridComponent,
  type HazardRepositoryItem,
} from "./SolutionRepositoryComponents";

const meta = {
  title: "CHART Repository/Hazards",
  component: HazardCardComponent,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof HazardCardComponent>;

export default meta;

type Story = StoryObj<typeof meta>;

export const HazardCard: Story = {
  args: {
    item: chartRepositoryHazards[0],
    onOpenDetail: () => undefined,
  },
  render: (args) => <SingleHazardCardPreview item={args.item} />,
};

export const HazardGrid: Story = {
  args: {
    item: chartRepositoryHazards[0],
    onOpenDetail: () => undefined,
  },
  render: () => <HazardGridPreview />,
};

export const HazardDrawer: Story = {
  args: {
    item: chartRepositoryHazards[0],
    onOpenDetail: () => undefined,
  },
  render: () => <HazardDrawerPreview />,
};

export const FunctionalHazards: Story = {
  args: {
    item: chartRepositoryHazards[0],
    onOpenDetail: () => undefined,
  },
  render: () => <HazardGridPreview />,
};

function SingleHazardCardPreview({ item }: { item: HazardRepositoryItem }) {
  const [selectedItem, setSelectedItem] = useState<HazardRepositoryItem | null>(null);

  return (
    <div style={{ maxWidth: 420, padding: 32 }}>
      <HazardCardComponent item={item} onOpenDetail={setSelectedItem} />
      {selectedItem ? (
        <HazardDrawerComponent
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
        />
      ) : null}
    </div>
  );
}

function HazardGridPreview() {
  const [selectedItem, setSelectedItem] = useState<HazardRepositoryItem | null>(null);

  return (
    <div style={{ padding: 32 }}>
      <HazardGridComponent
        items={chartRepositoryHazards}
        onOpenDetail={setSelectedItem}
      />
      {selectedItem ? (
        <HazardDrawerComponent
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
        />
      ) : null}
    </div>
  );
}

function HazardDrawerPreview() {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div style={{ minHeight: "100vh", padding: 32 }}>
      <button className="ghost-button" type="button" onClick={() => setIsOpen(true)}>
        Open drawer
      </button>
      {isOpen ? (
        <HazardDrawerComponent
          item={chartRepositoryHazards[0]}
          onClose={() => setIsOpen(false)}
        />
      ) : null}
    </div>
  );
}
