import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import { Slider } from ".";

const meta: Meta<typeof Slider> = {
  title: "Primitives/Slider",
  component: Slider,
};
export default meta;
type Story = StoryObj<typeof Slider>;

export const Temperature: Story = {
  render: () => {
    const [t, setT] = useState(32);
    return (
      <div style={{ width: 260 }}>
        <Slider
          min={30}
          max={35}
          step={0.1}
          value={t}
          onChange={setT}
          formatReadout={(v) => `${v.toFixed(1)}°C`}
          formatLabel={(v) => `${v}°C`}
          ariaLabel="Maternal heat exposure"
        />
      </div>
    );
  },
};
