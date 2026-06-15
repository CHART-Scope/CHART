import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Card } from "./Card";
import { TagList } from "./Tag";

const meta = {
  title: "UI/Card",
  component: Card,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof Card>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Static: Story = {
  args: {
    children: (
      <div style={{ display: "grid", gap: "0.65rem", padding: "0.9rem" }}>
        <strong>Urban greening</strong>
        <p style={{ margin: 0 }}>
          Expand tree cover and shaded public spaces to reduce urban heat islands.
        </p>
      </div>
    ),
  },
};

export const Interactive: Story = {
  args: {
    interactive: true,
    children: (
      <div style={{ display: "grid", gap: "0.65rem", padding: "0.9rem" }}>
        <strong>Early warning systems</strong>
        <p style={{ margin: 0 }}>
          Alert communities ahead of extreme heat and flood events.
        </p>
        <TagList labels={["Extreme heat", "Floods"]} />
      </div>
    ),
  },
};
