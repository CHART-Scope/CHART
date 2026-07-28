import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Panel } from ".";

const meta: Meta<typeof Panel> = {
  title: "Primitives/Panel",
  component: Panel,
};
export default meta;
type Story = StoryObj<typeof Panel>;

export const Default: Story = {
  args: {
    eyebrow: "Risk vs protection",
    children: "Cards use this as their base container.",
  },
  render: (args) => (
    <div style={{ width: 340 }}>
      <Panel {...args} />
    </div>
  ),
};

export const Muted: Story = {
  args: {
    variant: "muted",
    pad: "lg",
    children: (
      <div style={{ fontSize: 14, lineHeight: 1.8 }}>
        We're planning together for the next season for the impacts of extreme heat…
      </div>
    ),
  },
  render: (args) => (
    <div style={{ width: 640 }}>
      <Panel {...args} />
    </div>
  ),
};

export const Accent: Story = {
  args: {
    variant: "accent",
    pad: "md",
    children: (
      <>
        <h3
          style={{
            fontFamily: "var(--font-mono)",
            color: "var(--color-lime)",
            marginBottom: 5,
          }}
        >
          CHART collaborative workspace is ready
        </h3>
        <p style={{ fontSize: 12, opacity: 0.85, lineHeight: 1.6 }}>
          Surfacing shared risks and joint actions to protect health.
        </p>
      </>
    ),
  },
};
