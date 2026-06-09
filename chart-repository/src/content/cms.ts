import type {
  CostValue,
  HazardValue,
  SolutionTypeValue,
} from "../lib/chartRepositoryOptions";

export type CmsStatus = "draft" | "review" | "scheduled" | "published";

export type CmsAsset = {
  id?: string | number;
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
  solutionTypes: SolutionTypeValue[];
  climateHazards: HazardValue[];
  costOfImplementation?: CostValue;
  usefulLinks: CmsLink[];
  caseStudies: CmsAsset[];
  image?: CmsAsset;
};

export type CmsItem = {
  id: string;
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
