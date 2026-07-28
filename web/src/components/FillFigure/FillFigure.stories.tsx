import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { IconSprite } from "../Icon";
import { FillFigure } from ".";

const meta: Meta<typeof FillFigure> = {
  title: "Primitives/FillFigure",
  component: FillFigure,
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
type Story = StoryObj<typeof FillFigure>;

export const Default: Story = {
  args: {
    figure: "mother-baby",
    value: 72,
    label: "Heat exposed",
    caption: "72%",
    subFigure: "baby",
  },
};

export const Comparison: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 40 }}>
      <FillFigure
        figure="mother-baby"
        value={22}
        color="var(--color-nexus)"
        label="Shaded / cool"
        subFigure="baby"
      />
      <FillFigure
        figure="mother-baby"
        value={72}
        color="var(--color-maroon)"
        label="Heat exposed"
        subFigure="baby"
      />
    </div>
  ),
};

export const BabyOnly: Story = {
  args: {
    figure: "baby",
    value: 40,
    color: "var(--color-maroon)",
    caption: "40%",
    size: 90,
  },
};
