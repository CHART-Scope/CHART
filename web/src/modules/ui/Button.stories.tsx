import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Button } from "./Button";

const meta = {
  title: "CHART UI/Button",
  component: Button,
  args: {
    children: "Open workspace",
    variant: "primary",
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["primary", "green", "danger", "ghost"],
    },
  },
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Primary: Story = {};

export const Ghost: Story = {
  args: {
    children: "Open action repository",
    variant: "ghost",
  },
};

export const CompactDanger: Story = {
  args: {
    children: "Reset setup",
    compact: true,
    variant: "danger",
  },
};

export const Disabled: Story = {
  args: {
    children: "Customize",
    disabled: true,
    variant: "ghost",
  },
};
