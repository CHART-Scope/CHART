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
    country: "India",
    areaName: "Madhya Pradesh",
    hazardLabel: "Extreme heat",
    healthDomainLabel: "MNCH",
    onPlayVideo: () => undefined,
  },
};

export const KenyaKajiado: Story = {
  args: {
    country: "Kenya",
    areaName: "Kajiado",
    hazardLabel: "Extreme heat",
    healthDomainLabel: "MNCH",
    onPlayVideo: () => undefined,
  },
};
