import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Icon, IconSprite } from "../Icon";
import { Chip } from ".";

const meta: Meta<typeof Chip> = {
  title: "Primitives/Chip",
  component: Chip,
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
type Story = StoryObj<typeof Chip>;

export const Default: Story = { args: { children: "Community level" } };

export const AllTones: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <Chip tone="behaviour" leadingIcon={<Icon name="users" size={11} />}>
        Behaviour change
      </Chip>
      <Chip tone="environment" leadingIcon={<Icon name="leaf" size={11} />}>
        Environment
      </Chip>
      <Chip tone="policy" leadingIcon={<Icon name="policy" size={11} />}>
        Policy
      </Chip>
      <Chip tone="scenario">Season planning + Extreme heat + MNCH</Chip>
    </div>
  ),
};
