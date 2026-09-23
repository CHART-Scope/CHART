import type { Meta, StoryObj } from "@storybook/react";

import { SidebarContext } from "./SidebarContext";

/**
 * The planning context, restated in the sidebar.
 *
 * The dashboard cards name the place and the outcome, but they scroll away
 * and the sidebar does not — so the chrome that is always on screen should be
 * able to say what the user is looking at.
 *
 * The component is presentational, which is what makes every state below
 * reachable from a story; `SidebarPlanningContext` does the reading.
 */
const meta = {
  title: "AppShell/SidebarContext",
  component: SidebarContext,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: "16rem" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SidebarContext>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A county, with no intermediate level between it and the country. */
export const Kenya: Story = {
  args: {
    placeName: "Kajiado",
    levelLabel: "County",
    trail: ["Kenya"],
    hazardLabel: "Extreme heat",
    outcomeLabel: "Low birth weight",
  },
};

/** Three levels deep, so the trail has something to say. */
export const IndiaDivision: Story = {
  args: {
    placeName: "Bhopal Division",
    levelLabel: "Division",
    trail: ["India", "Madhya Pradesh"],
    hazardLabel: "Extreme heat",
    outcomeLabel: "Low birth weight",
  },
};

/** A second outcome must read as its own thing, not as low birth weight. */
export const UnderFiveMortality: Story = {
  args: {
    placeName: "Kajiado",
    levelLabel: "County",
    trail: ["Kenya"],
    hazardLabel: "Extreme heat",
    outcomeLabel: "Under-five mortality",
  },
};

/** While the geography list and model catalog are still being read. */
export const Loading: Story = {
  args: { loading: true },
};

/**
 * Nothing selected — off the dashboard, for instance. The block renders
 * nothing rather than an empty heading, so the sidebar does not grow a gap.
 */
export const NothingSelected: Story = {
  args: {},
};
