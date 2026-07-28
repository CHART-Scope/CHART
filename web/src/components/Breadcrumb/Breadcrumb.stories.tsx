import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Breadcrumb, BreadcrumbPill } from ".";

const meta: Meta<typeof Breadcrumb> = {
  title: "Primitives/Breadcrumb",
  component: Breadcrumb,
};
export default meta;
type Story = StoryObj<typeof Breadcrumb>;

export const Basic: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <BreadcrumbPill>India &gt; Madhya Pradesh</BreadcrumbPill>
      <Breadcrumb
        items={[{ label: "India" }, { label: "Madhya Pradesh", active: true }]}
      />
      <Breadcrumb
        items={[
          { label: "India" },
          { label: "Madhya Pradesh", onClick: () => {} },
          { label: "Recommended actions", active: true },
        ]}
      />
    </div>
  ),
};
