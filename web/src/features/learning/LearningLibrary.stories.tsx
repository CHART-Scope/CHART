import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { IconSprite } from "@/components/Icon";

import { CATALOGUE_FIXTURE } from "./data/catalogue.fixture";
import { FALLBACK_RESOURCES, FALLBACK_TRACKS } from "./data/fallback";
import { LearningLibraryContent } from "./LearningLibrary";

const meta: Meta<typeof LearningLibraryContent> = {
  title: "Learning/LearningLibrary",
  component: LearningLibraryContent,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <>
        <IconSprite />
        <Story />
      </>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof LearningLibraryContent>;

/**
 * What actually ships today: the hand-picked shortlist. The rest of the
 * catalogue is seeded and reachable through the API, but not shown yet.
 */
export const Shortlist: Story = {
  args: {
    resources: FALLBACK_RESOURCES,
    tracks: FALLBACK_TRACKS,
    onStartPlanning: () => undefined,
  },
};

/**
 * Every published resource — what the hub looks like once the wider library
 * is opened up. Not the shipped state; use it to check the design holds at
 * ninety-six cards rather than eight.
 */
export const WholeCatalogue: Story = {
  args: {
    resources: CATALOGUE_FIXTURE,
    tracks: FALLBACK_TRACKS,
    onStartPlanning: () => undefined,
  },
};

/** Videos only, with the link-outs filtered away. */
export const AllVideos: Story = {
  args: {
    resources: CATALOGUE_FIXTURE.filter((item) => item.youtube_id !== null),
    tracks: FALLBACK_TRACKS,
    onStartPlanning: () => undefined,
  },
};

/** Without the planning band, for installations that do not want it. */
export const NoPlanningBand: Story = {
  args: {
    resources: CATALOGUE_FIXTURE,
    tracks: FALLBACK_TRACKS,
    showPlanningBand: false,
  },
};
