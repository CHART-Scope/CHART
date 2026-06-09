import { getPayload } from "payload";

import config from "@payload-config";

import { impactGroupOptions, optionLabel } from "./chartRepositoryOptions";

type PublicRepositoryQuery = {
  hazard?: string;
  solutionType?: string;
  cost?: string;
  search?: string;
  status?: string;
  limit?: number;
};

type PublicTaxonomyRecord = {
  id: string;
  type: "hazard" | "solution_type";
  label: string;
};

type PublicLinkRecord = {
  label: string;
  url: string;
};

type PublicAssetRecord = {
  id: string;
  kind: string;
  filename: string;
  mimeType: string | null;
  sizeBytes: number | null;
  storageUrl: string | null;
  attribution: string | null;
};

type PublicImpactGroupRecord = {
  id: string;
  label: string;
  category: string;
};

type PublicHealthImplicationRecord = {
  id: string;
  label: string;
  examples: string | null;
  impactGroup: PublicImpactGroupRecord;
};

export type PublicHealthImplicationListRecord = PublicHealthImplicationRecord & {
  hazards: {
    id: string;
    label: string;
  }[];
};

export type PublicSolutionRecord = {
  id: string;
  slug: string;
  name: string;
  summary: string | null;
  description: string | null;
  implementationNotes: string | null;
  costOfImplementation: string | null;
  maintenanceRequirement: string | null;
  timeToImplement: string | null;
  evidenceLevel: string | null;
  sourceId: string;
  sourceRecordId: string | null;
  sourceVersion: string | null;
  sourceUpdatedAt: string | null;
  license: string | null;
  attribution: string | null;
  status: string;
  taxonomies: PublicTaxonomyRecord[];
  links: PublicLinkRecord[];
  assets: PublicAssetRecord[];
};

export type PublicSolutionListResponse = {
  items: PublicSolutionRecord[];
  total: number;
};

export type PublicHazardItem = {
  id: string;
  label: string;
  description: string | null;
  hazardGroup: string | null;
  imageUrl: string | null;
  healthImplications: PublicHealthImplicationRecord[];
  solutionCount: number;
};

export type PublicHazardListResponse = {
  items: PublicHazardItem[];
  impactGroups: PublicImpactGroupRecord[];
};

export type PublicHealthImplicationListResponse = {
  items: PublicHealthImplicationListRecord[];
  total: number;
};

export type PublicHazardDetailResponse = PublicHazardItem & {
  solutions: {
    id: string;
    name: string;
    slug: string;
    summary: string | null;
  }[];
};

type PayloadContentItem = {
  id: string | number;
  title?: string | null;
  summary?: string | null;
  body?: string | null;
  workflowState?: string | null;
  updatedAt?: string | null;
  image?: PayloadMedia | string | number | null;
  externalImage?: PayloadExternalAsset | null;
  caseStudies?: PayloadCaseStudy[] | null;
  solutionTypes?: PayloadArrayValue[] | string[] | null;
  climateHazards?: PayloadArrayValue[] | string[] | null;
  costOfImplementation?: string | null;
  usefulLinks?: PayloadLink[] | null;
  externalSource?: string | null;
  externalId?: string | null;
};

type PayloadHazard = {
  id: string | number;
  externalId?: string | null;
  slug?: string | null;
  label?: string | null;
  description?: string | null;
  hazardGroup?: string | null;
  imageUrl?: string | null;
  active?: boolean | null;
  sortOrder?: number | null;
};

type PayloadHealthImplication = {
  id: string | number;
  externalId?: string | null;
  label?: string | null;
  impactGroup?: string | null;
  examples?: string | null;
  hazards?: PayloadRelationshipValue[] | null;
  sortOrder?: number | null;
};

type PayloadRelationshipValue =
  | string
  | number
  | {
      id?: string | number | null;
      externalId?: string | null;
      label?: string | null;
    };

type PayloadMedia = {
  id?: string | number | null;
  url?: string | null;
  filename?: string | null;
  mimeType?: string | null;
  filesize?: number | null;
};

type PayloadExternalAsset = {
  id?: string | number | null;
  url?: string | null;
  filename?: string | null;
  type?: string | null;
  size?: number | null;
};

type PayloadCaseStudy = PayloadExternalAsset & {
  title?: string | null;
  file?: PayloadMedia | string | number | null;
};

type PayloadArrayValue = {
  value?: string | null;
};

type PayloadLink = {
  label?: string | null;
  url?: string | null;
};

const defaultSourceId = "chart-repository";
const taxonomyAliases: Record<string, string> = {
  cold_wave: "Cold wave",
  extreme_heat: "Extreme heat",
  flood: "Flood",
  floods: "Flood",
  increased_co2_levels: "Increased CO2 levels",
  increased_temperature: "Increased temperature",
  products_technology: "Products and technology",
  sea_level_rise: "Sea level rise",
  service_delivery: "Service delivery",
  wash: "WASH",
};

export async function listPublicSolutions(
  query: PublicRepositoryQuery,
  repositoryUrl: string,
): Promise<PublicSolutionListResponse> {
  const items = (await loadPublishedSolutions(repositoryUrl)).filter((item) =>
    matchesQuery(item, query),
  );

  return {
    items: items.slice(0, resolveLimit(query.limit)),
    total: items.length,
  };
}

export async function getPublicSolution(
  slug: string,
  repositoryUrl: string,
): Promise<PublicSolutionRecord | undefined> {
  return (await loadPublishedSolutions(repositoryUrl)).find(
    (item) => item.slug === slug,
  );
}

export async function listPublicSolutionTaxonomies(repositoryUrl: string) {
  const taxonomyMap = new Map<string, PublicTaxonomyRecord>();

  for (const item of await loadPublishedSolutions(repositoryUrl)) {
    for (const taxonomy of item.taxonomies) {
      taxonomyMap.set(taxonomy.id, taxonomy);
    }
  }

  return [...taxonomyMap.values()].sort(compareTaxonomies);
}

export async function listPublicHazards(
  repositoryUrl: string,
): Promise<PublicHazardListResponse> {
  const solutions = await loadPublishedSolutions(repositoryUrl);

  return loadPublicHazards(repositoryUrl, solutions);
}

export async function getPublicHazard(
  hazardId: string,
  repositoryUrl: string,
): Promise<PublicHazardDetailResponse | undefined> {
  const solutions = await loadPublishedSolutions(repositoryUrl);
  const hazard = (await loadPublicHazards(repositoryUrl, solutions)).items.find(
    (item) =>
      item.id === hazardId || normalizeSlug(item.label) === normalizeSlug(hazardId),
  );

  if (!hazard) {
    return undefined;
  }

  return {
    ...hazard,
    solutions: solutions
      .filter((solution) =>
        solution.taxonomies.some(
          (taxonomy) =>
            taxonomy.type === "hazard" &&
            (taxonomy.id === hazard.id ||
              normalizeSlug(taxonomy.label) === normalizeSlug(hazardId)),
        ),
      )
      .map((solution) => ({
        id: solution.id,
        name: solution.name,
        slug: solution.slug,
        summary: solution.summary,
      })),
  };
}

export async function listPublicHealthImplications(
  repositoryUrl: string,
): Promise<PublicHealthImplicationListResponse> {
  const { healthImplications } = await loadPublicHazardMetadata(repositoryUrl);

  return {
    items: healthImplications,
    total: healthImplications.length,
  };
}

export function readPublicRepositoryQuery(searchParams: URLSearchParams) {
  const limit = Number(searchParams.get("limit"));

  return {
    hazard: searchParams.get("hazard") ?? undefined,
    solutionType: searchParams.get("solutionType") ?? undefined,
    cost: searchParams.get("cost") ?? undefined,
    search: searchParams.get("search") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
  } satisfies PublicRepositoryQuery;
}

async function loadPublishedSolutions(repositoryUrl: string) {
  const payload = await getPayload({ config });
  const docs: PayloadContentItem[] = [];
  let page = 1;
  let hasNextPage = true;

  while (hasNextPage) {
    const result = await payload.find({
      collection: "content-items",
      depth: 1,
      limit: 100,
      page,
      sort: "-updatedAt",
      overrideAccess: false,
      where: {
        workflowState: {
          equals: "published",
        },
      },
    });

    docs.push(...(result.docs as PayloadContentItem[]));
    hasNextPage = Boolean(result.hasNextPage && result.nextPage);
    page = result.nextPage ?? page + 1;
  }

  return docs.map((doc) => mapPayloadContentItem(doc, repositoryUrl));
}

function mapPayloadContentItem(
  doc: PayloadContentItem,
  repositoryUrl: string,
): PublicSolutionRecord {
  const title = doc.title?.trim() || "Untitled solution";
  const body = doc.body?.trim() || doc.summary?.trim() || "";
  const slug = normalizeSlug(title);
  const taxonomies = uniqueTaxonomies([
    ...mapPayloadArrayValues(doc.climateHazards).map((label) =>
      normalizeTaxonomy("hazard", label),
    ),
    ...mapPayloadArrayValues(doc.solutionTypes).map((label) =>
      normalizeTaxonomy("solution_type", label),
    ),
  ]);

  return {
    id: `solution-${slug}`,
    slug,
    name: title,
    summary: doc.summary?.trim() || createSummary(body),
    description: body || null,
    implementationNotes: null,
    costOfImplementation: normalizeCost(doc.costOfImplementation ?? undefined),
    maintenanceRequirement: null,
    timeToImplement: null,
    evidenceLevel: null,
    sourceId: doc.externalSource?.trim() || defaultSourceId,
    sourceRecordId: doc.externalId?.trim() || String(doc.id),
    sourceVersion: doc.updatedAt ?? null,
    sourceUpdatedAt: doc.updatedAt ?? null,
    license: null,
    attribution: null,
    status: "published",
    taxonomies,
    links: mapPayloadLinks(doc.usefulLinks),
    assets: normalizePayloadAssets(slug, doc, repositoryUrl),
  };
}

async function loadPublicHazards(
  repositoryUrl: string,
  solutions: PublicSolutionRecord[],
) {
  const { hazards, healthImplicationsByHazardId, impactGroups } =
    await loadPublicHazardMetadata(repositoryUrl);

  if (hazards.length === 0) {
    return buildDerivedHazardList(solutions);
  }

  return {
    items: hazards.map((hazard) => ({
      id: hazard.id,
      label: hazard.label,
      description: hazard.description,
      hazardGroup: hazard.hazardGroup,
      imageUrl: hazard.imageUrl,
      healthImplications: healthImplicationsByHazardId.get(hazard.id) ?? [],
      solutionCount: countSolutionsForHazard(solutions, hazard),
    })),
    impactGroups,
  } satisfies PublicHazardListResponse;
}

async function loadPublicHazardMetadata(repositoryUrl: string) {
  const payload = await getPayload({ config });
  const [hazardResult, healthImplicationResult] = await Promise.all([
    payload.find({
      collection: "hazards",
      depth: 0,
      limit: 200,
      sort: "sortOrder",
      overrideAccess: false,
      where: {
        active: {
          not_equals: false,
        },
      },
    }),
    payload.find({
      collection: "health-implications",
      depth: 1,
      limit: 200,
      sort: "sortOrder",
      overrideAccess: false,
    }),
  ]);
  const hazardDocs = hazardResult.docs as PayloadHazard[];
  const healthImplicationDocs =
    healthImplicationResult.docs as PayloadHealthImplication[];
  const mappedHazards = hazardDocs.map((doc) => ({
    doc,
    hazard: mapPayloadHazard(doc),
  }));
  const hazards = mappedHazards.map((item) => item.hazard).sort(compareHazards);
  const hazardByPayloadId = new Map<string, PublicHazardItem>();
  const hazardByPublicId = new Map<string, PublicHazardItem>();
  const healthImplicationsByHazardId = new Map<
    string,
    PublicHealthImplicationRecord[]
  >();
  const healthImplications: PublicHealthImplicationListRecord[] = [];

  for (const { doc, hazard } of mappedHazards) {
    hazardByPayloadId.set(String(doc.id), hazard);
    hazardByPublicId.set(hazard.id, hazard);
  }

  for (const item of healthImplicationDocs.sort(compareHealthImplicationDocs)) {
    const healthImplication = mapPayloadHealthImplication(item);
    const linkedHazards = (item.hazards ?? [])
      .map((relationship) => {
        const relationshipId = payloadRelationshipId(relationship);
        const externalId = payloadRelationshipExternalId(relationship);

        return (
          (relationshipId ? hazardByPayloadId.get(relationshipId) : undefined) ??
          (externalId ? hazardByPublicId.get(externalId) : undefined)
        );
      })
      .filter((hazard): hazard is PublicHazardItem => Boolean(hazard));
    const uniqueHazards = uniqueHazardRefs(linkedHazards);

    healthImplications.push({
      ...healthImplication,
      hazards: uniqueHazards,
    });

    for (const hazard of uniqueHazards) {
      const existing = healthImplicationsByHazardId.get(hazard.id) ?? [];
      healthImplicationsByHazardId.set(hazard.id, [...existing, healthImplication]);
    }
  }

  return {
    hazards,
    healthImplications,
    healthImplicationsByHazardId,
    impactGroups: buildImpactGroups(healthImplications),
  };
}

function buildDerivedHazardList(solutions: PublicSolutionRecord[]) {
  const hazardMap = new Map<string, PublicHazardItem>();

  for (const solution of solutions) {
    for (const taxonomy of solution.taxonomies) {
      if (taxonomy.type !== "hazard") {
        continue;
      }

      const existing = hazardMap.get(taxonomy.id);
      hazardMap.set(taxonomy.id, {
        id: taxonomy.id,
        label: taxonomy.label,
        description: null,
        hazardGroup: null,
        imageUrl: null,
        healthImplications: [],
        solutionCount: (existing?.solutionCount ?? 0) + 1,
      });
    }
  }

  return {
    items: [...hazardMap.values()].sort((first, second) =>
      first.label.localeCompare(second.label),
    ),
    impactGroups: [],
  } satisfies PublicHazardListResponse;
}

function mapPayloadHazard(doc: PayloadHazard): PublicHazardItem {
  const label = doc.label?.trim() || "Untitled hazard";

  return {
    id: doc.externalId?.trim() || `hazard-${normalizeSlug(label)}`,
    label,
    description: doc.description?.trim() || null,
    hazardGroup: doc.hazardGroup?.trim() || null,
    imageUrl: normalizeAssetUrl(doc.imageUrl, ""),
    healthImplications: [],
    solutionCount: 0,
  };
}

function mapPayloadHealthImplication(
  doc: PayloadHealthImplication,
): PublicHealthImplicationRecord {
  const label = doc.label?.trim() || "Untitled health implication";
  const impactGroupId = doc.impactGroup?.trim() || "uncategorized";

  return {
    id: doc.externalId?.trim() || `health-${normalizeSlug(label)}`,
    label,
    examples: doc.examples?.trim() || null,
    impactGroup: {
      id: `impact-group-${normalizeSlug(impactGroupId)}`,
      label: optionLabel(impactGroupId, impactGroupOptions) ?? impactGroupId,
      category: impactGroupId,
    },
  };
}

function buildImpactGroups(items: PublicHealthImplicationListRecord[]) {
  const impactGroups = new Map<string, PublicImpactGroupRecord>();

  for (const item of items) {
    impactGroups.set(item.impactGroup.id, item.impactGroup);
  }

  return [...impactGroups.values()].sort(compareImpactGroups);
}

function countSolutionsForHazard(
  solutions: PublicSolutionRecord[],
  hazard: PublicHazardItem,
) {
  return solutions.filter((solution) =>
    solution.taxonomies.some(
      (taxonomy) =>
        taxonomy.type === "hazard" &&
        (taxonomy.id === hazard.id ||
          normalizeSlug(taxonomy.label) === normalizeSlug(hazard.label)),
    ),
  ).length;
}

function payloadRelationshipId(value: PayloadRelationshipValue) {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : value.id !== undefined && value.id !== null
      ? String(value.id)
      : undefined;
}

function payloadRelationshipExternalId(value: PayloadRelationshipValue) {
  return typeof value === "object" ? value.externalId?.trim() : undefined;
}

function uniqueHazardRefs(hazards: PublicHazardItem[]) {
  const byId = new Map<string, { id: string; label: string }>();

  for (const hazard of hazards) {
    byId.set(hazard.id, { id: hazard.id, label: hazard.label });
  }

  return [...byId.values()].sort((first, second) =>
    first.label.localeCompare(second.label),
  );
}

function compareHazards(first: PublicHazardItem, second: PublicHazardItem) {
  return first.label.localeCompare(second.label);
}

function compareHealthImplicationDocs(
  first: PayloadHealthImplication,
  second: PayloadHealthImplication,
) {
  return (
    (first.sortOrder ?? 0) - (second.sortOrder ?? 0) ||
    (first.label ?? "").localeCompare(second.label ?? "")
  );
}

function compareImpactGroups(
  first: PublicImpactGroupRecord,
  second: PublicImpactGroupRecord,
) {
  return impactGroupOrder(first.category) - impactGroupOrder(second.category);
}

function impactGroupOrder(value: string) {
  const index = impactGroupOptions.findIndex((option) => option.value === value);

  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function matchesQuery(item: PublicSolutionRecord, query: PublicRepositoryQuery) {
  return (
    matchesTaxonomy(item, "hazard", query.hazard) &&
    matchesTaxonomy(item, "solution_type", query.solutionType) &&
    matchesCost(item, query.cost) &&
    matchesStatus(item, query.status) &&
    matchesSearch(item, query.search)
  );
}

function matchesTaxonomy(
  item: PublicSolutionRecord,
  type: PublicTaxonomyRecord["type"],
  value: string | undefined,
) {
  if (!value?.trim()) {
    return true;
  }

  return item.taxonomies.some((taxonomy) => {
    return (
      taxonomy.type === type &&
      (taxonomy.id === value ||
        normalizeSlug(taxonomy.label) === normalizeSlug(value) ||
        normalizeLookupValue(taxonomy.label) === normalizeLookupValue(value))
    );
  });
}

function matchesCost(item: PublicSolutionRecord, value: string | undefined) {
  return !value?.trim() || item.costOfImplementation === normalizeCost(value);
}

function matchesStatus(item: PublicSolutionRecord, value: string | undefined) {
  return !value?.trim() || item.status === value;
}

function matchesSearch(item: PublicSolutionRecord, value: string | undefined) {
  const search = value?.trim().toLowerCase();

  if (!search) {
    return true;
  }

  return [item.name, item.summary, item.description].some((text) =>
    text?.toLowerCase().includes(search),
  );
}

function normalizeTaxonomy(type: PublicTaxonomyRecord["type"], value: string) {
  const label = normalizeTaxonomyLabel(value);
  const prefix = type === "hazard" ? "hazard" : "solution-type";

  return {
    id: `${prefix}-${normalizeSlug(label)}`,
    type,
    label,
  };
}

function normalizeTaxonomyLabel(value: string) {
  const trimmedValue = value.trim();
  return taxonomyAliases[normalizeLookupValue(trimmedValue)] ?? trimmedValue;
}

function uniqueTaxonomies(taxonomies: PublicTaxonomyRecord[]) {
  const byId = new Map<string, PublicTaxonomyRecord>();

  for (const taxonomy of taxonomies) {
    byId.set(taxonomy.id, taxonomy);
  }

  return [...byId.values()].sort(compareTaxonomies);
}

function compareTaxonomies(first: PublicTaxonomyRecord, second: PublicTaxonomyRecord) {
  return (
    first.type.localeCompare(second.type) || first.label.localeCompare(second.label)
  );
}

function mapPayloadArrayValues(values?: PayloadArrayValue[] | string[] | null) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((value) => (typeof value === "string" ? value : value.value))
    .filter((value): value is string => Boolean(value?.trim()));
}

function mapPayloadLinks(values?: PayloadLink[] | null) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((link): PublicLinkRecord => {
      const url = link.url?.trim() ?? "";

      return {
        label: link.label?.trim() || url,
        url,
      };
    })
    .filter((link) => Boolean(link.url));
}

function normalizePayloadAssets(
  slug: string,
  item: PayloadContentItem,
  repositoryUrl: string,
) {
  const assets: PublicAssetRecord[] = [];
  const coverImage =
    mapPayloadMedia(item.image, repositoryUrl) ??
    mapPayloadExternalAsset(item.externalImage, repositoryUrl);

  if (coverImage) {
    assets.push({
      ...coverImage,
      id: `solution-asset-${slug}-image`,
      kind: "image",
      filename: coverImage.filename || "Cover image",
    });
  }

  for (const [index, asset] of (item.caseStudies ?? []).entries()) {
    const caseStudy =
      mapPayloadMedia(asset.file, repositoryUrl) ??
      mapPayloadExternalAsset(asset, repositoryUrl);

    if (!caseStudy) {
      continue;
    }

    assets.push({
      ...caseStudy,
      id: `solution-asset-${slug}-case-study-${index}`,
      kind: "case_study",
      filename:
        asset.title?.trim() ||
        caseStudy.filename ||
        asset.filename?.trim() ||
        "Case study",
    });
  }

  return assets;
}

function mapPayloadMedia(
  media: PayloadMedia | string | number | null | undefined,
  repositoryUrl: string,
): Omit<PublicAssetRecord, "id" | "kind"> | undefined {
  if (!media || typeof media === "string" || typeof media === "number") {
    return undefined;
  }

  return createAssetRecord({
    filename: media.filename,
    mimeType: media.mimeType,
    sizeBytes: media.filesize,
    storageUrl: media.url,
    repositoryUrl,
  });
}

function mapPayloadExternalAsset(
  asset: PayloadExternalAsset | null | undefined,
  repositoryUrl: string,
): Omit<PublicAssetRecord, "id" | "kind"> | undefined {
  if (!asset) {
    return undefined;
  }

  return createAssetRecord({
    filename: asset.filename,
    mimeType: asset.type,
    sizeBytes: asset.size,
    storageUrl: asset.url,
    repositoryUrl,
  });
}

function createAssetRecord(input: {
  filename?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  storageUrl?: string | null;
  repositoryUrl: string;
}): Omit<PublicAssetRecord, "id" | "kind"> | undefined {
  const filename = input.filename?.trim() ?? "";
  const storageUrl = normalizeAssetUrl(input.storageUrl, input.repositoryUrl);

  if (!filename && !storageUrl) {
    return undefined;
  }

  return {
    filename,
    mimeType: input.mimeType ?? null,
    sizeBytes: input.sizeBytes ?? null,
    storageUrl,
    attribution: null,
  };
}

function normalizeCost(value: string | undefined) {
  const normalizedValue = value?.trim().toLowerCase();

  if (!normalizedValue) {
    return null;
  }

  if (normalizedValue.includes("high")) {
    return "high";
  }

  if (normalizedValue.includes("medium")) {
    return "medium";
  }

  if (normalizedValue.includes("low")) {
    return "low";
  }

  return normalizedValue;
}

function normalizeAssetUrl(value: string | null | undefined, repositoryUrl: string) {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return null;
  }

  try {
    return new URL(trimmedValue, `${trimTrailingSlash(repositoryUrl)}/`).toString();
  } catch {
    return trimmedValue;
  }
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function normalizeLookupValue(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function createSummary(description: string) {
  const compactDescription = description.replace(/\s+/g, " ").trim();

  if (compactDescription.length <= 220) {
    return compactDescription;
  }

  return `${compactDescription.slice(0, 217).trim()}...`;
}

function resolveLimit(limit: number | undefined) {
  if (!limit) {
    return 100;
  }

  return Math.max(1, Math.min(limit, 100));
}
