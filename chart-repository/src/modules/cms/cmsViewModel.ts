import {
  type CmsItem,
  type CmsSolutionMetadata,
  type CmsStatus,
} from "../../content/cms";
import {
  costOptions,
  optionLabel,
  solutionTypeOptions,
} from "../../lib/chartRepositoryOptions";
import { type EditorDraft } from "./types";

export const cmsStatuses: readonly CmsStatus[] = [
  "draft",
  "review",
  "scheduled",
  "published",
];

export const cmsStatusFilters: readonly (CmsStatus | "all")[] = ["all", ...cmsStatuses];

export function emptySolution(): CmsSolutionMetadata {
  return {
    solutionTypes: [],
    climateHazards: [],
    usefulLinks: [],
    caseStudies: [],
  };
}

export function mergeSolution(solution?: Partial<CmsSolutionMetadata>) {
  return {
    ...emptySolution(),
    ...solution,
    solutionTypes: solution?.solutionTypes ?? [],
    climateHazards: solution?.climateHazards ?? [],
    usefulLinks: solution?.usefulLinks ?? [],
    caseStudies: solution?.caseStudies ?? [],
  };
}

export function createDraft(item?: CmsItem): EditorDraft {
  if (!item) {
    return {
      title: "Untitled content",
      summary: "",
      body: "",
      tag: solutionTypeOptions[0].value,
      solution: emptySolution(),
    };
  }

  return {
    title: item.title,
    summary: item.summary,
    body: item.body,
    tag: item.tag,
    solution: mergeSolution(item.solution),
  };
}

export function prettyStatusLabel(status: CmsStatus) {
  if (status === "review") {
    return "In review";
  }

  if (status === "published") {
    return "Published";
  }

  if (status === "scheduled") {
    return "Scheduled";
  }

  return "Draft";
}

export function solutionTypeLabels(solution: CmsSolutionMetadata) {
  return solution.solutionTypes.map(
    (value) => optionLabel(value, solutionTypeOptions) ?? value,
  );
}

export function solutionMetaLine(item: CmsItem) {
  return [
    solutionTypeLabels(item.solution)[0],
    optionLabel(item.solution.costOfImplementation, costOptions),
  ]
    .filter(Boolean)
    .join(" · ");
}

export function solutionImageUrl(item: CmsItem | EditorDraft) {
  return item.solution?.image?.url;
}
