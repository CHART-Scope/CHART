import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { IconSprite } from "@/components/Icon";

import { FALLBACK_RESOURCES } from "./data/fallback";
import { ResourceCard } from "./ResourceCard";

const video = FALLBACK_RESOURCES.find((item) => item.youtube_id)!;
const kenyan = FALLBACK_RESOURCES.find((item) => item.countries.includes("Kenya"))!;
const linkOnly = FALLBACK_RESOURCES.find((item) => !item.youtube_id) ?? video;

const meta: Meta<typeof ResourceCard> = {
  title: "Learning/ResourceCard",
  component: ResourceCard,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <>
        <IconSprite />
        <div style={{ maxWidth: 300 }}>
          <Story />
        </div>
      </>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof ResourceCard>;

export const Video: Story = { args: { resource: video } };

export const CountrySpecific: Story = { args: { resource: kenyan } };

/** No thumbnail exists for link-only material, so the kind is named instead. */
export const LinkOnly: Story = { args: { resource: linkOnly } };
