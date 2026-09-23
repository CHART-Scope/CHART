import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { IconSprite } from "@/components/Icon";
import { DashboardHeader } from "./DashboardHeader";

const meta: Meta<typeof DashboardHeader> = {
  title: "Dashboard/DashboardHeader",
  component: DashboardHeader,
  parameters: {
    layout: "padded",
  },
  decorators: [
    (Story) => (
      <>
        <IconSprite />
        <Story />
      </>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof DashboardHeader>;

export const IndiaMadhyaPradesh: Story = {
  args: {
    trail: ["India", "Madhya Pradesh", "Bhopal Division"],
    hazardLabel: "Extreme heat",
    healthDomainLabel: "MNCH",
  },
};

export const KenyaKajiado: Story = {
  args: {
    trail: ["Kenya", "Kajiado"],
    hazardLabel: "Extreme heat",
    healthDomainLabel: "MNCH",
  },
};

/**
 * A country-level view. The trail collapses to one step rather than
 * rendering "Kenya › Kenya", which is what a separately derived country and
 * area name produced here.
 */
export const CountryLevelDoesNotRepeatItself: Story = {
  args: {
    trail: ["Kenya", "Kenya"],
    hazardLabel: "Extreme heat",
    healthDomainLabel: "Maternal, newborn and child health",
  },
};
