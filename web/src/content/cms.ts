export type CmsStatus = "draft" | "review" | "scheduled" | "published";
export type CmsType = "solution" | "model" | "vra" | "landing";

export type CmsAsset = {
  url?: string;
  filename?: string;
  type?: string;
  size?: number;
};

export type CmsLink = {
  label?: string;
  url: string;
};

export type CmsSolutionMetadata = {
  solutionType?: string;
  solutionGroup?: string;
  climateHazards: string[];
  healthDomains: string[];
  resiliencePhases: string[];
  costOfImplementation?: string;
  implementationEffort?: string;
  usefulLinks: CmsLink[];
  caseStudies: CmsAsset[];
  image?: CmsAsset;
  organizationName?: string;
  contactInformation?: string;
  externalSource?: string;
  externalId?: string;
};

export type CmsItem = {
  id: string;
  type: CmsType;
  title: string;
  tag: string;
  status: CmsStatus;
  owner: string;
  updated: string;
  scheduledDate?: string;
  summary: string;
  body: string;
  thumbnail: string;
  solution: CmsSolutionMetadata;
};

export type SubmissionItem = {
  id: number;
  organization: string;
  origin: string;
  title: string;
  description: string;
  tags: string[];
  received: string;
  state: "new" | "imported" | "waiting";
};

const emptySolution: CmsSolutionMetadata = {
  climateHazards: [],
  healthDomains: [],
  resiliencePhases: [],
  usefulLinks: [],
  caseStudies: [],
};

export const cmsItems: CmsItem[] = [
  {
    id: "s-heatcare",
    type: "solution",
    title: "HeatCare Kit: household-level protection for at-risk groups",
    tag: "Household kit",
    status: "review",
    owner: "Priya N.",
    updated: "2 h ago",
    scheduledDate: "2026-05-28",
    summary:
      "Low-cost kit — ORS, thermometer, cooling cloth and behavioural guide via ASHA networks.",
    body: "The HeatCare Kit is a compact household intervention for periods of acute heat stress. It combines low-cost physical supplies with a clear behavioural guide that can be distributed through ASHA and ANM networks.\n\nThe package is designed for at-risk households, especially pregnant women, under-five children and elderly family members. It can be triggered by heat alerts and embedded into routine outreach.\n\nThe content should stay practical: what to do before peak heat, what to do during the hottest part of the day, and when to seek care.",
    thumbnail: "linear-gradient(135deg,#9AB89D,#5C8762)",
    solution: emptySolution,
  },
  {
    id: "s-coolroof",
    type: "solution",
    title: "Cool-roof retrofit guide for PHCs",
    tag: "Infrastructure",
    status: "scheduled",
    owner: "Asha R.",
    updated: "yesterday",
    scheduledDate: "2026-05-25",
    summary:
      "Reference designs for cool-roof retrofits reducing facility temperature by 2–4°C.",
    body: "This guide collects practical cool-roof references for PHCs and similar frontline facilities. It is intended to support quick feasibility review and cost framing during planning.\n\nThe structure combines simple implementation sketches, maintenance notes and examples from comparable health-facility contexts.",
    thumbnail: "linear-gradient(135deg,#E5DDF3,#6B5FB4)",
    solution: emptySolution,
  },
  {
    id: "s-training",
    type: "solution",
    title: "Climate Ready training: facilitator pack v3",
    tag: "Training",
    status: "published",
    owner: "Rahul A.",
    updated: "4 May",
    scheduledDate: "2026-05-04",
    summary:
      "Eight modules for ASHAs, ANMs and PHC medical officers responding to climate-related health pressure.",
    body: "Climate Ready is a facilitation pack for frontline workers and PHC teams. It brings together the minimum content needed for safe response, role clarity and district-level follow through.\n\nThe published pack is intended as a reusable public resource and should stay easy to localize.",
    thumbnail: "linear-gradient(135deg,#F4B58A,#E07F4F)",
    solution: emptySolution,
  },
  {
    id: "m-heatmnch",
    type: "model",
    title: "Heat-MNCH risk index v1.4",
    tag: "Model · MNCH",
    status: "published",
    owner: "Sneha L.",
    updated: "2 May",
    scheduledDate: "2026-05-02",
    summary:
      "Combines downscaled temperature projections with maternal and child health indicators.",
    body: "The Heat-MNCH index is a public-facing model note that explains the relationship between climate stress, exposure and maternal-child health pressure.\n\nThis content should remain transparent about assumptions, source datasets and how the score is interpreted in planning.",
    thumbnail: "linear-gradient(135deg,#FCE9DF,#F0936B)",
    solution: emptySolution,
  },
  {
    id: "v-workforce",
    type: "vra",
    title: "Health workforce indicator catalogue v2.2",
    tag: "VRA · Indicators",
    status: "review",
    owner: "Priya N.",
    updated: "5 h ago",
    scheduledDate: "2026-05-30",
    summary: "Updated indicators on workforce absorptive capacity and surge readiness.",
    body: "This catalogue groups workforce indicators into readiness, continuity and surge-response buckets. It supports the vulnerability and resilience flow and is meant to be paired with district discussion.\n\nThe next revision should tighten wording and add one concrete example for each indicator family.",
    thumbnail: "linear-gradient(135deg,#E0F4F4,#0EA5A5)",
    solution: emptySolution,
  },
  {
    id: "l-hero",
    type: "landing",
    title: "Landing hero — monsoon-season copy",
    tag: "Hero block",
    status: "scheduled",
    owner: "Rahul A.",
    updated: "20 May",
    scheduledDate: "2026-06-01",
    summary:
      "Seasonal landing-page rotation for monsoon framing and partner entry points.",
    body: "This landing block updates the public site for monsoon season while keeping the product framing clear. It should remain concise and tie directly back to public resources and partner sign-in.\n\nThe copy should not drift into internal process language.",
    thumbnail: "linear-gradient(135deg,#E8F3EA,#2E9449)",
    solution: emptySolution,
  },
];

export const cmsSubmissions: SubmissionItem[] = [
  {
    id: 28,
    organization: "Sahaayata Trust",
    origin: "Belagavi, Karnataka · 3rd contribution",
    title: "HeatCare Kit: household-level protection for at-risk groups",
    description:
      "Low-cost kit and demonstration protocol — ORS, thermometer, cooling cloth and behavioural guide distributed via ASHA networks during heat alerts.",
    tags: ["Heat", "Household", "MNCH"],
    received: "14 May 2026",
    state: "imported",
  },
  {
    id: 31,
    organization: "River Studios",
    origin: "Bhopal, Madhya Pradesh · 1st contribution",
    title: "Flood-readiness pictograms for low-literacy populations",
    description:
      "Illustrated pictograms covering evacuation, ORS, water purification and child safety in Hindi, Marathi and Bengali.",
    tags: ["Flood", "IEC", "Community"],
    received: "18 May 2026",
    state: "new",
  },
  {
    id: 35,
    organization: "BharatNet Health Lab",
    origin: "Bengaluru · 1st contribution",
    title: "SMS heat-alert relay — open-source pilot",
    description:
      "Reference implementation for SMS-based heat-alert relay targeting community health workers in low-bandwidth districts.",
    tags: ["Heat", "Tech", "Workforce"],
    received: "20 May 2026",
    state: "new",
  },
];
