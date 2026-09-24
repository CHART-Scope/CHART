import type { Meta, StoryObj } from "@storybook/react";

import { Skeleton, SkeletonCard, SkeletonText } from "./Skeleton";

/**
 * Placeholders shaped like the content that is coming.
 *
 * A spinner says only "something is happening". A block the size of the
 * heading followed by lines the width of the sentence says what is arriving,
 * and stops the layout jumping when it does.
 */
const meta = {
  title: "Components/Skeleton",
  component: Skeleton,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Bar: Story = {
  args: { width: "16rem", height: "1rem" },
};

export const Paragraph: Story = {
  render: () => (
    <div style={{ maxWidth: "24rem" }}>
      <SkeletonText lines={4} />
    </div>
  ),
};

/** The default card shape: eyebrow, heading, then prose. */
export const Card: Story = {
  render: () => (
    <div style={{ maxWidth: "22rem" }}>
      <SkeletonCard label="Loading example card" />
    </div>
  ),
};

/**
 * A card composed to match a specific layout. Shaping the placeholder like
 * the real thing is the whole point — this is what the dashboard does.
 */
export const ComposedCard: Story = {
  render: () => (
    <div style={{ maxWidth: "22rem" }}>
      <SkeletonCard label="Loading the risk map">
        <Skeleton width="9rem" height="0.75rem" />
        <Skeleton width="60%" height="1.25rem" />
        <Skeleton width="100%" height="12rem" radius="md" />
        <Skeleton width="85%" height="0.875rem" />
      </SkeletonCard>
    </div>
  ),
};
