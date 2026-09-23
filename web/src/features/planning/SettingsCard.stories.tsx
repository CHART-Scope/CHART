import type { Meta, StoryObj } from "@storybook/react";

import { SettingsCard } from "./SettingsCard";

/**
 * The one shape every settings block uses.
 *
 * Settings had grown four card idioms — one with an eyebrow and a skeleton,
 * one with a bare title and the word "Loading…", one with its own header, and
 * one built from the Panel primitive. Four ways of saying the same thing made
 * the page read as four pages.
 */
const meta = {
  title: "Planning/SettingsCard",
  component: SettingsCard,
  parameters: { layout: "padded" },
} satisfies Meta<typeof SettingsCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    eyebrow: "Climate data",
    title: "Observations held per country",
    description: "One pull fetches a single grid covering every area in the country.",
    children: <p style={{ margin: 0 }}>Body content sits here.</p>,
  },
};

/** With a control in the header, the way the model hub links to its sub-page. */
export const WithAction: Story = {
  args: {
    ...Default.args,
    action: <button type="button">Model hub →</button>,
  },
};

/**
 * Loading is part of the shell, so no card has to invent it — and none
 * announces a wait in prose.
 */
export const Loading: Story = {
  args: { ...Default.args, loading: true, loadingRows: 3 },
};

/** Errors are announced, and sit above the body rather than replacing it. */
export const WithError: Story = {
  args: {
    ...Default.args,
    error: "Could not load models (CHART_API_UNAVAILABLE)",
  },
};

/** No description: omitted rather than padded with filler. */
export const TitleOnly: Story = {
  args: {
    eyebrow: "Administration",
    title: "People and access",
    children: <p style={{ margin: 0 }}>Body content sits here.</p>,
  },
};
