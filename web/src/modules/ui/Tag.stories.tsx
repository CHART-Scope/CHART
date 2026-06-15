import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Tag, TagList } from "./Tag";

const meta = {
  title: "UI/Tag",
  component: Tag,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof Tag>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: "Extreme heat",
  },
};

export const Muted: Story = {
  args: {
    children: "Not classified yet",
    muted: true,
  },
};

export const List: Story = {
  args: {
    children: "Extreme heat",
  },
  render: () => <TagList labels={["Extreme heat", "Floods", "Vector-borne disease"]} />,
};
