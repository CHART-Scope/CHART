import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { InvitationEmail } from "./InvitationEmail";
import { InvitationEmailTemplate } from "./InvitationEmailTemplate";
import { Login } from "./Login";
import { OnboardingFlow } from "./OnboardingFlow";
import { OnboardingWizard } from "./OnboardingWizard";

const meta: Meta = {
  title: "Pages/Onboarding",
  parameters: { layout: "fullscreen", backgrounds: { default: "ivory" } },
};
export default meta;
type Story = StoryObj;

export const InvitationEmailScreen: Story = { render: () => <InvitationEmail /> };
export const InvitationTemplate: Story = {
  render: () => (
    <div style={{ maxWidth: 680, margin: "48px auto", padding: "36px" }}>
      <InvitationEmailTemplate />
    </div>
  ),
};
export const LandingAndSignIn: Story = {
  render: () => <Login setupMode="configured" />,
};
export const FreshInstallationLanding: Story = {
  render: () => <Login setupMode="required" />,
};
export const InstallationSetup: Story = {
  render: () => <OnboardingWizard initialState={{ country: "India" }} />,
};
export const AdministrativeArea: Story = {
  render: () => (
    <OnboardingWizard
      initialStep={1}
      initialState={{
        country: "India",
        level: "State",
        geo: "Madhya Pradesh",
      }}
    />
  ),
};
export const SectorsAndRoles: Story = {
  render: () => (
    <OnboardingWizard
      initialStep={2}
      initialState={{
        country: "India",
        level: "State",
        geo: "Madhya Pradesh",
      }}
    />
  ),
};
export const WorkspaceReview: Story = {
  render: () => (
    <OnboardingWizard
      initialStep={3}
      initialState={{
        country: "India",
        level: "State",
        geo: "Madhya Pradesh",
        primarySectorId: "water",
        collaboratingSectorIds: new Set(["agriculture"]),
        adminName: "CHART Administrator",
        adminEmail: "admin@example.org",
        adminPassword: "example-password",
      }}
    />
  ),
};
export const FullFlow: Story = { render: () => <OnboardingFlow /> };
