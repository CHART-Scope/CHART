import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { SolutionRepositoryItem } from "../../lib/solutionRepositoryClient";
import {
  SolutionRepositoryDetailDrawer,
  SolutionRepositoryItemCard,
} from "./SolutionRepositoryComponents";

const coverImage =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 800'%3E%3Crect width='1200' height='800' fill='%23dff2e6'/%3E%3Cpath d='M0 580c150-95 260-120 390-72 116 43 189 128 327 106 132-21 209-127 360-95 58 12 98 38 123 62v219H0z' fill='%2341a56f'/%3E%3Cpath d='M0 671c178-64 314-63 460 3 143 65 262 84 420 24 143-54 238-58 320-20v122H0z' fill='%231e7661'/%3E%3Ccircle cx='943' cy='170' r='82' fill='%23f7c948'/%3E%3C/svg%3E";

const floodItem: SolutionRepositoryItem = {
  id: "solution-1",
  slug: "cooling-and-flood-resilience-centres",
  name: "Cooling and flood resilience centres",
  summary:
    "Upgrade trusted community facilities so residents can access safe cooling, clean water, and flood response support during extreme weather.",
  description:
    "This action turns existing community facilities into climate-health support points for heatwaves and flooding.\n\nTeams can phase improvements across priority districts, starting with shade, water, ventilation, backup power, and referral pathways.",
  implementationNotes:
    "Start with facilities that already serve older adults, pregnant people, and informal settlements.",
  costOfImplementation: "medium",
  maintenanceRequirement: "medium",
  timeToImplement: "3-6 months",
  evidenceLevel: "moderate",
  sourceId: "chart-seed",
  sourceRecordId: "seed-001",
  sourceVersion: "2026.1",
  sourceUpdatedAt: "2026-06-09T12:00:00.000Z",
  license: "CC BY 4.0",
  attribution: "CHART seed repository",
  status: "published",
  taxonomies: [
    { id: "flooding", type: "hazard", label: "Flooding" },
    { id: "extreme-heat", type: "hazard", label: "Extreme heat" },
    { id: "facility-upgrade", type: "solution_type", label: "Facility upgrade" },
    {
      id: "community-response",
      type: "solution_type",
      label: "Community response",
    },
  ],
  links: [
    {
      label: "Implementation checklist",
      url: "https://example.com/checklist",
    },
    {
      label: "Partner coordination guide",
      url: "https://example.com/coordination",
    },
  ],
  assets: [
    {
      id: "asset-image",
      kind: "image",
      filename: "community-centre.svg",
      mimeType: "image/svg+xml",
      sizeBytes: 5240,
      storageUrl: coverImage,
      attribution: "CHART story asset",
    },
    {
      id: "asset-case-study",
      kind: "case_study",
      filename: "district-resilience-centres.pdf",
      mimeType: "application/pdf",
      sizeBytes: 184000,
      storageUrl: "https://example.com/case-study.pdf",
      attribution: "Example partner",
    },
  ],
};

const noImageItem: SolutionRepositoryItem = {
  ...floodItem,
  id: "solution-2",
  slug: "heat-health-worker-training",
  name: "Heat-health worker training",
  summary:
    "Prepare frontline teams to identify heat stress, coordinate referrals, and communicate protective guidance before heat season.",
  costOfImplementation: "low",
  taxonomies: [
    { id: "extreme-heat", type: "hazard", label: "Extreme heat" },
    { id: "capacity-building", type: "solution_type", label: "Capacity building" },
  ],
  links: [],
  assets: [],
};

const highCostItem: SolutionRepositoryItem = {
  ...floodItem,
  id: "solution-3",
  slug: "hospital-flood-protection",
  name: "Hospital flood protection package",
  summary:
    "Protect critical care facilities with drainage upgrades, protected power systems, and patient transfer protocols.",
  costOfImplementation: "high",
  taxonomies: [
    { id: "flooding", type: "hazard", label: "Flooding" },
    { id: "infrastructure", type: "solution_type", label: "Infrastructure" },
  ],
};

const meta = {
  title: "Solution Repository/Components",
  component: SolutionRepositoryItemCard,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof SolutionRepositoryItemCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const ItemCard: Story = {
  args: {
    item: floodItem,
    onOpenDetail: () => undefined,
  },
  render: (args) => (
    <div style={{ maxWidth: 420, padding: 32 }}>
      <SolutionRepositoryItemCard {...args} />
    </div>
  ),
};

export const ItemGrid: Story = {
  args: {
    item: floodItem,
    onOpenDetail: () => undefined,
  },
  render: (args) => (
    <div
      className="solution-repository-grid public-repository-grid"
      style={{ padding: 32 }}
    >
      {[floodItem, noImageItem, highCostItem].map((item) => (
        <SolutionRepositoryItemCard
          item={item}
          key={item.id}
          onOpenDetail={args.onOpenDetail}
        />
      ))}
    </div>
  ),
};

export const DetailDrawer: Story = {
  args: {
    item: floodItem,
    onOpenDetail: () => undefined,
  },
  render: () => (
    <SolutionRepositoryDetailDrawer item={floodItem} onClose={() => undefined} />
  ),
};
