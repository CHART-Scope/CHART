import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Icon, ICON_NAMES, IconSprite } from ".";

const meta: Meta<typeof Icon> = {
  title: "Primitives/Icon",
  component: Icon,
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
type Story = StoryObj<typeof Icon>;

export const All: Story = {
  render: () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(6, 1fr)",
        gap: 16,
        fontFamily: "var(--font-display)",
        fontSize: 11,
      }}
    >
      {ICON_NAMES.map((n) => (
        <div
          key={n}
          style={{
            border: "1px solid var(--border-subtle)",
            borderRadius: 8,
            padding: 12,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            background: "var(--color-white)",
            color: "var(--color-charcoal)",
          }}
        >
          <Icon name={n} size={24} />
          <span>{n}</span>
        </div>
      ))}
    </div>
  ),
};

export const Single: Story = {
  args: { name: "arrow-right", size: 24 },
};
