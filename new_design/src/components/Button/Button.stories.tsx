import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Icon, IconSprite } from "../Icon";
import { Button } from ".";

const meta: Meta<typeof Button> = {
  title: "Primitives/Button",
  component: Button,
  args: { children: "Continue" },
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
type Story = StoryObj<typeof Button>;

export const Primary: Story = { args: { variant: "primary" } };
export const Secondary: Story = { args: { variant: "secondary" } };
export const Ghost: Story = { args: { variant: "ghost" } };
export const Disabled: Story = { args: { disabled: true } };
export const WithTrailingIcon: Story = {
  args: {
    trailingIcon: <Icon name="arrow-right" size={14} />,
  },
};
export const WithLeadingIcon: Story = {
  args: {
    variant: "secondary",
    leadingIcon: <Icon name="arrow-left" size={14} />,
    children: "Back",
  },
};

export const Row: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 12 }}>
      <Button variant="secondary" leadingIcon={<Icon name="arrow-left" size={14} />}>
        Back
      </Button>
      <Button variant="primary" trailingIcon={<Icon name="arrow-right" size={14} />}>
        Continue
      </Button>
    </div>
  ),
};
