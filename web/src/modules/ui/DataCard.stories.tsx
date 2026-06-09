import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Button } from "./Button";
import { DataCard } from "./DataCard";
import { LoadingPlaceholder } from "./LoadingPlaceholder";

const meta = {
  title: "CHART UI/DataCard",
  component: DataCard,
} satisfies Meta<typeof DataCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    children: null,
  },
  render: () => (
    <DataCard eyebrow="Risk map" title="Western Province">
      <p style={{ color: "var(--ink-soft)", lineHeight: 1.6, margin: 0 }}>
        Heat exposure and service readiness summary for the selected geography.
      </p>
    </DataCard>
  ),
};

export const WithActions: Story = {
  args: {
    children: null,
  },
  render: () => (
    <DataCard
      eyebrow="Risk map"
      title="Western Province"
      actions={
        <Button compact variant="ghost">
          Open repository
        </Button>
      }
    >
      <p style={{ color: "var(--ink-soft)", lineHeight: 1.6, margin: 0 }}>
        Heat exposure and service readiness summary for the selected geography.
      </p>
    </DataCard>
  ),
};

export const Loading: Story = {
  args: {
    children: null,
  },
  render: () => (
    <DataCard eyebrow="Climate indicators" title="Loading data">
      <LoadingPlaceholder lines={4} />
    </DataCard>
  ),
};
