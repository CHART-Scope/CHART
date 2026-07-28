import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { InvitationEmail } from "./InvitationEmail";
import { Login } from "./Login";
import { OnboardingFlow } from "./OnboardingFlow";
import { OnboardingWizard } from "./OnboardingWizard";

const meta: Meta = {
  title: "Pages/Onboarding (Kenya)",
  parameters: { layout: "fullscreen", backgrounds: { default: "ivory" } },
};
export default meta;
type Story = StoryObj;

export const InvitationEmailScreen: Story = { render: () => <InvitationEmail /> };
export const LoginScreen: Story = { render: () => <Login /> };
export const Wizard: Story = { render: () => <OnboardingWizard /> };
export const FullFlow: Story = { render: () => <OnboardingFlow /> };
