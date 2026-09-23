import type { Meta, StoryObj } from "@storybook/react";

import { DashboardSkeleton } from "./DashboardSkeleton";

/**
 * What the dashboard shows while its session is being restored.
 *
 * It replaced a full-page card reading "Opening sign in", which rendered on
 * every visit even though restoring a session is neither a sign-in nor slow.
 * Because the dashboard's layout is known ahead of time, the placeholder can
 * be the layout — so nothing moves when the data lands.
 */
const meta = {
  title: "Dashboard/DashboardSkeleton",
  component: DashboardSkeleton,
  parameters: { layout: "padded" },
} satisfies Meta<typeof DashboardSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
