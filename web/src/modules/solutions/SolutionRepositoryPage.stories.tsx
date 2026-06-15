import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { SolutionRepositoryItem } from "../../lib/solutionRepositoryClient";
import { chartRepositorySolutions } from "./chartRepositoryStoryData";
import { SolutionRepositoryExplorer } from "./SolutionRepositoryPage";

import "./SolutionRepositoryPage.css";

function collectStoryTaxonomies(items: SolutionRepositoryItem[]) {
  const taxonomyMap = new Map<string, SolutionRepositoryItem["taxonomies"][number]>();

  for (const item of items) {
    for (const taxonomy of item.taxonomies) {
      taxonomyMap.set(taxonomy.id, taxonomy);
    }
  }

  return [...taxonomyMap.values()];
}

const storyTaxonomies = collectStoryTaxonomies(chartRepositorySolutions);

const meta = {
  title: "Pages/Solution Repository",
  component: SolutionRepositoryExplorer,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    items: chartRepositorySolutions,
    taxonomies: storyTaxonomies,
  },
  decorators: [
    (Story) => (
      <div className="landing-shell">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SolutionRepositoryExplorer>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Explorer: Story = {};

export const Loading: Story = {
  args: {
    isLoading: true,
    items: [],
  },
};

export const Empty: Story = {
  args: {
    items: [],
  },
};

export const RepositoryUnavailable: Story = {
  args: {
    error: "The public solution repository could not be loaded.",
    items: [],
  },
};
