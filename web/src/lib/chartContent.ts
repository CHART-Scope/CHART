import type {
  CostValue,
  HazardValue,
  SolutionTypeValue,
} from "./solutionRepositoryOptions";
import {
  costOptions,
  hazardOptions,
  normalizeOptionValue,
  normalizeOptionValues,
  solutionTypeOptions,
} from "./solutionRepositoryOptions";

export type ChartCmsStatus = "draft" | "review" | "scheduled" | "published";

export type ChartCmsAsset = {
  id?: string | number;
  url?: string;
  filename?: string;
  type?: string;
  size?: number;
};

export type ChartCmsLink = {
  label?: string;
  url: string;
};

export type ChartCmsSolutionMetadata = {
  solutionTypes: SolutionTypeValue[];
  climateHazards: HazardValue[];
  costOfImplementation?: CostValue;
  usefulLinks: ChartCmsLink[];
  caseStudies: ChartCmsAsset[];
  image?: ChartCmsAsset;
};

export type ChartCmsDraftInput = {
  title: string;
  summary: string;
  body: string;
  tag: string;
  solution?: Partial<ChartCmsSolutionMetadata>;
};

export type ChartCmsItem = ChartCmsDraftInput & {
  id: string;
  status: ChartCmsStatus;
  owner: string;
  updated: string;
  scheduledDate?: string;
  thumbnail: string;
  solution: ChartCmsSolutionMetadata;
};

export type ChartSubmissionItem = {
  id: number;
  organization: string;
  origin: string;
  title: string;
  description: string;
  tags: string[];
  received: string;
  state: "new" | "imported" | "waiting";
};

export type StoredContentItem = {
  id: string;
  title: string;
  summary: string;
  body: string;
  tag: SolutionTypeValue | string;
  workflowState: ChartCmsStatus;
  owner?: string | null;
  scheduledDate?: string | null;
  updatedAt?: string | Date | null;
  image?: StoredMedia | string | null;
  externalImage?: StoredAsset | null;
  caseStudies?: StoredAsset[] | null;
  solutionTypes?: StoredArrayValue[] | string[] | null;
  climateHazards?: StoredArrayValue[] | string[] | null;
  costOfImplementation?: string | null;
  usefulLinks?: StoredLink[] | null;
};

type StoredArrayValue = {
  value?: string | null;
};

type StoredAsset = {
  id?: string | number | null;
  url?: string | null;
  filename?: string | null;
  type?: string | null;
  size?: number | null;
  title?: string | null;
};

type StoredLink = {
  label?: string | null;
  url?: string | null;
};

type StoredMedia = {
  id?: string | number | null;
  url?: string | null;
  filename?: string | null;
  mimeType?: string | null;
  filesize?: number | null;
};

export type StoredSubmission = {
  id: number;
  organization: string;
  origin: string;
  title: string;
  description: string;
  tags?: { value: string }[] | string[] | null;
  received?: string | Date | null;
  state: "new" | "imported" | "waiting";
};

export function createCmsThumbnail(imageUrl?: string) {
  if (imageUrl) {
    return `url("${imageUrl}") center / cover`;
  }

  return "linear-gradient(135deg,#9AB89D,#5C8762)";
}

function mapArrayValues(values?: StoredArrayValue[] | string[] | null) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((value) => (typeof value === "string" ? value : value.value))
    .filter((value): value is string => Boolean(value));
}

function mapAsset(asset?: StoredAsset | null): ChartCmsAsset | undefined {
  if (!asset?.url && !asset?.filename) {
    return undefined;
  }

  return {
    url: asset.url ?? undefined,
    filename: asset.filename ?? undefined,
    id: asset.id ?? undefined,
    type: asset.type ?? undefined,
    size: asset.size ?? undefined,
  };
}

function mapMedia(media?: StoredMedia | string | null): ChartCmsAsset | undefined {
  if (!media || typeof media === "string") {
    return undefined;
  }

  return {
    url: media.url ?? undefined,
    filename: media.filename ?? undefined,
    id: media.id ?? undefined,
    type: media.mimeType ?? undefined,
    size: media.filesize ?? undefined,
  };
}

function mapLinks(links?: StoredLink[] | null): ChartCmsLink[] {
  if (!Array.isArray(links)) {
    return [];
  }

  return links
    .map((link) => ({
      label: link.label ?? undefined,
      url: link.url ?? "",
    }))
    .filter((link) => link.url);
}

function toLinkRows(values?: ChartCmsLink[]) {
  return (
    values
      ?.filter((link) => link.url)
      .map((link) => ({
        label: link.label,
        url: link.url,
      })) ?? []
  );
}

function toAssetRows(values?: ChartCmsAsset[]) {
  return (
    values
      ?.filter((asset) => asset.url || asset.filename)
      .map((asset) => ({
        title: asset.filename,
        filename: asset.filename,
        url: asset.url,
        type: asset.type,
        size: asset.size,
      })) ?? []
  );
}

function relationshipId(asset?: ChartCmsAsset) {
  return typeof asset?.id === "number" ? asset.id : undefined;
}

export function mapDraftToContentData(draft: ChartCmsDraftInput) {
  const solution = draft.solution ?? {};

  return {
    title: draft.title,
    summary: draft.summary,
    body: draft.body,
    tag: draft.tag as SolutionTypeValue,
    image: relationshipId(solution.image),
    solutionTypes: solution.solutionTypes ?? [],
    climateHazards: solution.climateHazards ?? [],
    costOfImplementation: solution.costOfImplementation,
    usefulLinks: toLinkRows(solution.usefulLinks),
    caseStudies: toAssetRows(solution.caseStudies),
    externalImage: relationshipId(solution.image) ? undefined : solution.image,
  };
}

function formatRelativeTime(input?: string | Date | null) {
  if (!input) {
    return "Just now";
  }

  const date = input instanceof Date ? input : new Date(input);
  const diffMilliseconds = date.getTime() - Date.now();
  const diffMinutes = Math.round(diffMilliseconds / (1000 * 60));
  const absoluteMinutes = Math.abs(diffMinutes);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (absoluteMinutes < 60) {
    return formatter.format(diffMinutes, "minute");
  }

  const diffHours = Math.round(diffMinutes / 60);

  if (Math.abs(diffHours) < 24) {
    return formatter.format(diffHours, "hour");
  }

  const diffDays = Math.round(diffHours / 24);

  if (Math.abs(diffDays) < 30) {
    return formatter.format(diffDays, "day");
  }

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function toIsoDate(input?: string | Date | null) {
  if (!input) {
    return undefined;
  }

  return (input instanceof Date ? input : new Date(input)).toISOString().slice(0, 10);
}

export function mapContentItem(doc: StoredContentItem): ChartCmsItem {
  const uploadedImage = mapMedia(doc.image);
  const externalImage = mapAsset(doc.externalImage);
  const image = uploadedImage ?? externalImage;

  return {
    id: doc.id,
    title: doc.title,
    tag: doc.tag,
    status: doc.workflowState,
    owner: doc.owner ?? "Editorial team",
    updated: formatRelativeTime(doc.updatedAt),
    scheduledDate: toIsoDate(doc.scheduledDate),
    summary: doc.summary,
    body: doc.body,
    thumbnail: createCmsThumbnail(image?.url),
    solution: {
      solutionTypes: normalizeOptionValues(
        mapArrayValues(doc.solutionTypes),
        solutionTypeOptions,
      ),
      climateHazards: normalizeOptionValues(
        mapArrayValues(doc.climateHazards),
        hazardOptions,
      ),
      costOfImplementation: normalizeOptionValue(
        doc.costOfImplementation ?? undefined,
        costOptions,
      ),
      usefulLinks: mapLinks(doc.usefulLinks),
      caseStudies: Array.isArray(doc.caseStudies)
        ? doc.caseStudies
            .map(mapAsset)
            .filter((asset): asset is ChartCmsAsset => Boolean(asset))
        : [],
      image,
    },
  };
}

export function mapSubmission(doc: StoredSubmission): ChartSubmissionItem {
  const tags = Array.isArray(doc.tags)
    ? doc.tags.map((tag) => (typeof tag === "string" ? tag : tag.value))
    : [];

  const receivedDate = doc.received
    ? new Date(doc.received).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Pending";

  return {
    id: doc.id,
    organization: doc.organization,
    origin: doc.origin,
    title: doc.title,
    description: doc.description,
    tags,
    received: receivedDate,
    state: doc.state,
  };
}
