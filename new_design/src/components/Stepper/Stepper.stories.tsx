import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Stepper } from ".";

const meta: Meta<typeof Stepper> = {
  title: "Composites/Stepper",
  component: Stepper,
  parameters: { backgrounds: { default: "charcoal" } },
};
export default meta;
type Story = StoryObj<typeof Stepper>;

const steps = [
  { id: "country", title: "Country", sub: "Select your country" },
  { id: "area", title: "Administrative area", sub: "Level & geography" },
  { id: "sector", title: "Sector", sub: "Your role & collaborators" },
  { id: "workspace", title: "CHART workspace", sub: "Review & launch" },
];

export const StepTwo: Story = {
  render: () => (
    <div style={{ width: 220, background: "var(--color-charcoal)", padding: 20 }}>
      <Stepper steps={steps} currentIndex={1} />
    </div>
  ),
};
