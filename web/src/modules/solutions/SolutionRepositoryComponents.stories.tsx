import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { SolutionRepositoryItem } from "../../lib/solutionRepositoryClient";
import {
  chartRepositorySolutions,
  floatingClinic,
  mentalHealthScreening,
} from "./chartRepositoryStoryData";
import {
  SolutionCard as SolutionCardComponent,
  SolutionDrawer as SolutionDrawerComponent,
  SolutionGrid as SolutionGridComponent,
  SolutionRepositoryItemCard,
} from "./SolutionRepositoryComponents";

const meta = {
  title: "CHART Repository/Solutions",
  component: SolutionRepositoryItemCard,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof SolutionRepositoryItemCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const ItemCard: Story = {
  args: {
    item: mentalHealthScreening,
    onOpenDetail: () => undefined,
  },
  render: (args) => <SingleSolutionCardPreview item={args.item} />,
};

export const SolutionCard: Story = {
  args: {
    item: floatingClinic,
    onOpenDetail: () => undefined,
  },
  render: (args) => <SingleSolutionCardPreview item={args.item} variant="solution" />,
};

export const SolutionGrid: Story = {
  args: {
    item: mentalHealthScreening,
    onOpenDetail: () => undefined,
  },
  render: () => <SolutionGridPreview />,
};

export const SolutionDrawer: Story = {
  args: {
    item: mentalHealthScreening,
    onOpenDetail: () => undefined,
  },
  render: () => <SolutionDrawerPreview />,
};

export const FunctionalSolutions: Story = {
  args: {
    item: mentalHealthScreening,
    onOpenDetail: () => undefined,
  },
  render: () => <SolutionGridPreview />,
};

function SingleSolutionCardPreview({
  item,
  variant = "item",
}: {
  item: SolutionRepositoryItem;
  variant?: "item" | "solution";
}) {
  const [selectedItem, setSelectedItem] = useState<SolutionRepositoryItem | null>(null);

  return (
    <div style={{ maxWidth: 420, padding: 32 }}>
      {variant === "solution" ? (
        <SolutionCardComponent item={item} onOpenDetail={setSelectedItem} />
      ) : (
        <SolutionRepositoryItemCard item={item} onOpenDetail={setSelectedItem} />
      )}
      {selectedItem ? (
        <SolutionDrawerComponent
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
        />
      ) : null}
    </div>
  );
}

function SolutionGridPreview() {
  const [selectedItem, setSelectedItem] = useState<SolutionRepositoryItem | null>(null);

  return (
    <div style={{ padding: 32 }}>
      <SolutionGridComponent
        items={chartRepositorySolutions}
        onOpenDetail={setSelectedItem}
      />
      {selectedItem ? (
        <SolutionDrawerComponent
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
        />
      ) : null}
    </div>
  );
}

function SolutionDrawerPreview() {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div style={{ minHeight: "100vh", padding: 32 }}>
      <button className="ghost-button" type="button" onClick={() => setIsOpen(true)}>
        Open drawer
      </button>
      {isOpen ? (
        <SolutionDrawerComponent
          item={mentalHealthScreening}
          onClose={() => setIsOpen(false)}
        />
      ) : null}
    </div>
  );
}
