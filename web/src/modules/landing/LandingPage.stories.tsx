import { useState, type MouseEvent } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { SolutionRepositoryItem } from "../../lib/solutionRepositoryClient";
import { chartRepositorySolutions } from "../solutions/chartRepositoryStoryData";
import { SolutionRepositoryExplorer } from "../solutions/SolutionRepositoryPage";
import { LandingPage } from "./LandingPage";
import {
  LandingHero,
  PartnerLogoBlock,
  PartnerSection,
  ToolkitSection,
} from "./LandingSections";

const noopNavigate = () => undefined;

const meta = {
  title: "Pages/Landing",
  component: LandingPage,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    onNavigate: noopNavigate,
  },
} satisfies Meta<typeof LandingPage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const FullLandingPage: Story = {
  render: () => <LandingStoryRouter />,
};

export const LandingComponentReview: Story = {
  render: () => (
    <div className="landing-shell">
      <LandingHero />
      <ToolkitSection />
      <PartnerSection />
    </div>
  ),
};

export const Hero: Story = {
  render: () => (
    <div className="landing-shell landing-story-section">
      <LandingHero />
    </div>
  ),
};

export const ToolkitRows: Story = {
  render: () => (
    <div className="landing-shell">
      <ToolkitSection />
    </div>
  ),
};

export const PartnerContact: Story = {
  render: () => (
    <div className="landing-shell">
      <PartnerSection />
    </div>
  ),
};

export const PartnerLogos: Story = {
  render: () => (
    <div className="landing-shell landing-story-section">
      <PartnerLogoBlock />
    </div>
  ),
};

function LandingStoryRouter() {
  const [route, setRoute] = useState<"landing" | "solutions">("landing");

  if (route === "solutions") {
    return <StorybookSolutionRepositoryPage />;
  }

  function handleClickCapture(event: MouseEvent<HTMLDivElement>) {
    if (!(event.target instanceof Element)) {
      return;
    }

    const link = event.target.closest<HTMLAnchorElement>('a[href="/solutions"]');

    if (!link) {
      return;
    }

    event.preventDefault();
    setRoute("solutions");
  }

  return (
    <div onClickCapture={handleClickCapture}>
      <LandingPage onNavigate={noopNavigate} />
    </div>
  );
}

function StorybookSolutionRepositoryPage() {
  return (
    <div className="landing-shell">
      <SolutionRepositoryExplorer
        items={chartRepositorySolutions}
        taxonomies={collectStoryTaxonomies(chartRepositorySolutions)}
      />
    </div>
  );
}

function collectStoryTaxonomies(items: SolutionRepositoryItem[]) {
  const taxonomyMap = new Map<string, SolutionRepositoryItem["taxonomies"][number]>();

  for (const item of items) {
    for (const taxonomy of item.taxonomies) {
      taxonomyMap.set(taxonomy.id, taxonomy);
    }
  }

  return [...taxonomyMap.values()];
}
