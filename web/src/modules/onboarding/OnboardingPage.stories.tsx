import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { countryOptions } from "../../lib/countries";
import type { SetupOptions, SetupStatus } from "../../lib/setupClient";
import { OnboardingPage } from "./OnboardingPage";

const initialOptions: SetupOptions = {
  hazards: [
    { id: "extreme-heat", label: "Extreme heat" },
    { id: "floods", label: "Floods" },
    { id: "drought", label: "Drought" },
    { id: "vector-borne-disease", label: "Vector-borne disease" },
    { id: "storm", label: "Storm" },
    { id: "wildfire", label: "Wildfire" },
  ],
};

const firstBootstrapStatus: SetupStatus = {
  completed: false,
  requiresOnboarding: true,
  selectedHazards: [],
  counts: {
    geographies: 0,
    workspaceMembers: 0,
  },
};

const meta = {
  title: "Pages/Onboarding",
  component: OnboardingPage,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    countryOptions,
    initialOptions,
    initialStatus: firstBootstrapStatus,
    onNavigate: () => undefined,
    skipSetupLoad: true,
  },
} satisfies Meta<typeof OnboardingPage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const JurisdictionStep: Story = {
  args: { initialStepIndex: 0 },
};

export const FocusAreasStep: Story = {
  args: { initialStepIndex: 1 },
};

export const AccountStep: Story = {
  args: { initialStepIndex: 2 },
};

export const FullOnboardingFlow: Story = {
  args: { initialStepIndex: 0 },
};
