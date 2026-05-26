export type ChartCmsStatus = "draft" | "review" | "scheduled" | "published";
export type ChartCmsType = "solution" | "model" | "vra" | "landing";

export type ChartCmsAsset = {
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
  solutionType?: string;
  solutionGroup?: string;
  climateHazards: string[];
  healthDomains: string[];
  resiliencePhases: string[];
  costOfImplementation?: string;
  implementationEffort?: string;
  usefulLinks: ChartCmsLink[];
  caseStudies: ChartCmsAsset[];
  image?: ChartCmsAsset;
  organizationName?: string;
  contactInformation?: string;
  externalSource?: string;
  externalId?: string;
};

export type ChartCmsDraftInput = {
  title: string;
  summary: string;
  body: string;
  type: ChartCmsType;
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
  type: ChartCmsType;
  tag: string;
  workflowState: ChartCmsStatus;
  owner?: string | null;
  scheduledDate?: string | null;
  updatedAt?: string | Date | null;
  image?: StoredMedia | string | null;
  externalImage?: StoredAsset | null;
  caseStudies?: StoredAsset[] | null;
  solutionType?: string | null;
  solutionGroup?: string | null;
  climateHazards?: StoredArrayValue[] | string[] | null;
  healthDomains?: StoredArrayValue[] | string[] | null;
  resiliencePhases?: StoredArrayValue[] | string[] | null;
  costOfImplementation?: string | null;
  implementationEffort?: string | null;
  usefulLinks?: StoredLink[] | null;
  organizationName?: string | null;
  contactInformation?: string | null;
  externalSource?: string | null;
  externalId?: string | null;
};

type StoredArrayValue = {
  value?: string | null;
};

type StoredAsset = {
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

export function createCmsThumbnail(type: ChartCmsType, imageUrl?: string) {
  if (imageUrl) {
    return `url("${imageUrl}") center / cover`;
  }

  if (type === "model") {
    return "linear-gradient(135deg,#FCE9DF,#F0936B)";
  }

  if (type === "vra") {
    return "linear-gradient(135deg,#E0F4F4,#0EA5A5)";
  }

  if (type === "landing") {
    return "linear-gradient(135deg,#E8F3EA,#2E9449)";
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

function toArrayRows(values?: string[]) {
  return values?.filter(Boolean).map((value) => ({ value })) ?? [];
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

export function mapDraftToContentData(draft: ChartCmsDraftInput) {
  const solution = draft.solution ?? {};

  return {
    title: draft.title,
    summary: draft.summary,
    body: draft.body,
    type: draft.type,
    tag: draft.tag,
    solutionType: solution.solutionType,
    solutionGroup: solution.solutionGroup,
    climateHazards: toArrayRows(solution.climateHazards),
    healthDomains: toArrayRows(solution.healthDomains),
    resiliencePhases: toArrayRows(solution.resiliencePhases),
    costOfImplementation: solution.costOfImplementation,
    implementationEffort: solution.implementationEffort,
    usefulLinks: toLinkRows(solution.usefulLinks),
    caseStudies: toAssetRows(solution.caseStudies),
    externalImage: solution.image,
    organizationName: solution.organizationName,
    contactInformation: solution.contactInformation,
    externalSource: solution.externalSource,
    externalId: solution.externalId,
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
    type: doc.type,
    title: doc.title,
    tag: doc.tag,
    status: doc.workflowState,
    owner: doc.owner ?? "Editorial team",
    updated: formatRelativeTime(doc.updatedAt),
    scheduledDate: toIsoDate(doc.scheduledDate),
    summary: doc.summary,
    body: doc.body,
    thumbnail: createCmsThumbnail(doc.type, image?.url),
    solution: {
      solutionType: doc.solutionType ?? undefined,
      solutionGroup: doc.solutionGroup ?? undefined,
      climateHazards: mapArrayValues(doc.climateHazards),
      healthDomains: mapArrayValues(doc.healthDomains),
      resiliencePhases: mapArrayValues(doc.resiliencePhases),
      costOfImplementation: doc.costOfImplementation ?? undefined,
      implementationEffort: doc.implementationEffort ?? undefined,
      usefulLinks: mapLinks(doc.usefulLinks),
      caseStudies: Array.isArray(doc.caseStudies)
        ? doc.caseStudies
            .map(mapAsset)
            .filter((asset): asset is ChartCmsAsset => Boolean(asset))
        : [],
      image,
      organizationName: doc.organizationName ?? undefined,
      contactInformation: doc.contactInformation ?? undefined,
      externalSource: doc.externalSource ?? undefined,
      externalId: doc.externalId ?? undefined,
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
