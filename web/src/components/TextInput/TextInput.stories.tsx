import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { TextInput } from ".";

const meta: Meta<typeof TextInput> = {
  title: "Primitives/TextInput",
  component: TextInput,
  args: { label: "Email address", placeholder: "you@example.com" },
};
export default meta;
type Story = StoryObj<typeof TextInput>;

export const Default: Story = {};
export const Password: Story = {
  args: { label: "Password", type: "password", defaultValue: "********" },
};
