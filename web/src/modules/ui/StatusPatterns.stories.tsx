import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { ActionItem } from "./ActionItem";
import { ErrorBanner } from "./ErrorBanner";
import { LoadingPlaceholder } from "./LoadingPlaceholder";

const meta = {
  title: "CHART UI/Status Patterns",
  parameters: {
    layout: "padded",
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const ActionList: Story = {
  render: () => (
    <div
      style={{
        background: "#fff",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: "1rem",
        width: "min(34rem, 100%)",
      }}
    >
      <ActionItem
        title="Update heat-health response plan"
        assignee="Health planning lead"
        status="In progress"
        statusVariant="in-progress"
      />
      <ActionItem
        title="Review cooling center locations"
        assignee="Cross-sector lead"
        status="Review"
        statusVariant="review"
      />
      <ActionItem
        title="Publish public action summary"
        status="Waiting"
        statusVariant="waiting"
      />
    </div>
  ),
};

export const ErrorState: Story = {
  render: () => (
    <div style={{ width: "min(34rem, 100%)" }}>
      <ErrorBanner
        dismissable={false}
        message="The public action repository could not be loaded."
      />
    </div>
  ),
};

export const LoadingState: Story = {
  render: () => (
    <div style={{ width: "min(34rem, 100%)" }}>
      <LoadingPlaceholder lines={5} />
    </div>
  ),
};
