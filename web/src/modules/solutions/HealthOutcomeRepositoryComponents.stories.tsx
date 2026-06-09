import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { chartRepositoryHealthOutcomes } from "./chartRepositoryStoryData";
import {
  HealthOutcomeCard as HealthOutcomeCardComponent,
  HealthOutcomeDrawer as HealthOutcomeDrawerComponent,
  HealthOutcomeGrid as HealthOutcomeGridComponent,
  type HealthOutcomeRepositoryItem,
} from "./SolutionRepositoryComponents";

const meta = {
  title: "CHART Repository/Health Outcomes",
  component: HealthOutcomeCardComponent,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof HealthOutcomeCardComponent>;

export default meta;

type Story = StoryObj<typeof meta>;

export const HealthOutcomeCard: Story = {
  args: {
    item: chartRepositoryHealthOutcomes[0],
    onOpenDetail: () => undefined,
  },
  render: (args) => <SingleHealthOutcomeCardPreview item={args.item} />,
};

export const HealthOutcomeGrid: Story = {
  args: {
    item: chartRepositoryHealthOutcomes[0],
    onOpenDetail: () => undefined,
  },
  render: () => <HealthOutcomeGridPreview />,
};

export const HealthOutcomeDrawer: Story = {
  args: {
    item: chartRepositoryHealthOutcomes[0],
    onOpenDetail: () => undefined,
  },
  render: () => <HealthOutcomeDrawerPreview />,
};

export const FunctionalHealthOutcomes: Story = {
  args: {
    item: chartRepositoryHealthOutcomes[0],
    onOpenDetail: () => undefined,
  },
  render: () => <HealthOutcomeGridPreview />,
};

function SingleHealthOutcomeCardPreview({
  item,
}: {
  item: HealthOutcomeRepositoryItem;
}) {
  const [selectedItem, setSelectedItem] = useState<HealthOutcomeRepositoryItem | null>(
    null,
  );

  return (
    <div style={{ maxWidth: 420, padding: 32 }}>
      <HealthOutcomeCardComponent item={item} onOpenDetail={setSelectedItem} />
      {selectedItem ? (
        <HealthOutcomeDrawerComponent
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
        />
      ) : null}
    </div>
  );
}

function HealthOutcomeGridPreview() {
  const [selectedItem, setSelectedItem] = useState<HealthOutcomeRepositoryItem | null>(
    null,
  );

  return (
    <div style={{ padding: 32 }}>
      <HealthOutcomeGridComponent
        items={chartRepositoryHealthOutcomes}
        onOpenDetail={setSelectedItem}
      />
      {selectedItem ? (
        <HealthOutcomeDrawerComponent
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
        />
      ) : null}
    </div>
  );
}

function HealthOutcomeDrawerPreview() {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div style={{ minHeight: "100vh", padding: 32 }}>
      <button className="ghost-button" type="button" onClick={() => setIsOpen(true)}>
        Open drawer
      </button>
      {isOpen ? (
        <HealthOutcomeDrawerComponent
          item={chartRepositoryHealthOutcomes[0]}
          onClose={() => setIsOpen(false)}
        />
      ) : null}
    </div>
  );
}
