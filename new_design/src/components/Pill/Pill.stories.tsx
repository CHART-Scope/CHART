import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import { Icon, IconSprite } from "../Icon";
import { Pill } from ".";

const meta: Meta<typeof Pill> = {
  title: "Primitives/Pill",
  component: Pill,
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
type Story = StoryObj<typeof Pill>;

export const Default: Story = { args: { children: "Health" } };
export const Selected: Story = { args: { children: "Health", selected: true } };
export const WithIcon: Story = {
  args: {
    children: "Health",
    leadingIcon: <Icon name="stethoscope" size={13} />,
  },
};

export const Grid: Story = {
  render: () => {
    const options = [
      { id: "health", label: "Health", icon: "stethoscope" as const },
      {
        id: "climate",
        label: "Environment & climate change",
        icon: "cloud-storm" as const,
      },
      { id: "animal", label: "Animal health", icon: "paw" as const },
      { id: "agri", label: "Agriculture", icon: "plant" as const },
      { id: "disaster", label: "Disaster management", icon: "alert-triangle" as const },
      { id: "urban", label: "Urban planning", icon: "building-community" as const },
      { id: "water", label: "Water and sanitation", icon: "droplet" as const },
      { id: "energy", label: "Energy", icon: "bolt" as const },
    ];
    const [sel, setSel] = useState<string | null>("health");
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, maxWidth: 500 }}>
        {options.map((o) => (
          <Pill
            key={o.id}
            selected={sel === o.id}
            leadingIcon={<Icon name={o.icon} size={13} />}
            onClick={() => setSel(o.id)}
          >
            {o.label}
          </Pill>
        ))}
      </div>
    );
  },
};
