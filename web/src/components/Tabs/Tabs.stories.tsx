import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import { Tabs } from ".";

const meta: Meta<typeof Tabs> = {
  title: "Primitives/Tabs",
  component: Tabs,
};
export default meta;
type Story = StoryObj<typeof Tabs>;

const items = [
  { value: "short", label: "Short-term" },
  { value: "long", label: "Long-term" },
] as const;

export const ShortTermActive: Story = {
  render: () => {
    const [value, setValue] = useState<"short" | "long">("short");
    return (
      <Tabs items={items} value={value} onChange={setValue} ariaLabel="Predictions view">
        <p style={{ color: "#4a4a4a" }}>Chart for &quot;{value}&quot; would render here.</p>
      </Tabs>
    );
  },
};

export const LongTermActive: Story = {
  render: () => {
    const [value, setValue] = useState<"short" | "long">("long");
    return (
      <Tabs items={items} value={value} onChange={setValue} ariaLabel="Predictions view">
        <p style={{ color: "#4a4a4a" }}>Chart for &quot;{value}&quot; would render here.</p>
      </Tabs>
    );
  },
};

export const WithDisabledOption: Story = {
  render: () => {
    const [value, setValue] = useState<"short" | "long">("short");
    return (
      <Tabs
        items={[items[0], { ...items[1], disabled: true }]}
        value={value}
        onChange={setValue}
        ariaLabel="Predictions view"
      />
    );
  },
};
