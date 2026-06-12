import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { TextInput } from "./TextInput";

const meta = {
  title: "UI/Text Input",
  component: TextInput,
  parameters: {
    layout: "padded",
  },
  args: {
    label: "Search",
    placeholder: "Search solutions",
  },
} satisfies Meta<typeof TextInput>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Search: Story = {};
