import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Button } from "./Button";
import { Navbar } from "./Navbar";

const meta = {
  title: "UI/Navbar",
  component: Navbar,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    action: <Button compact>Sign in</Button>,
    ariaLabel: "CHART public sections",
    links: [
      { href: "/#models", label: "Climate and health risks" },
      { href: "/#vra", label: "Vulnerability assessments" },
      { href: "/solutions", label: "Solution repository" },
    ],
  },
} satisfies Meta<typeof Navbar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const PublicHeader: Story = {};
