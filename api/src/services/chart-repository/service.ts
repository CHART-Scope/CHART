import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type {
  ChartRepositoryHazardDetailResponse,
  ChartRepositoryHazardItem,
  ChartRepositoryHazardListResponse,
  ChartRepositoryHazardSolution,
  ChartRepositorySolutionAssetRecord,
  ChartRepositorySolutionErrorCode,
  ChartRepositorySolutionItemRecord,
  ChartRepositorySolutionListResponse,
  ChartRepositorySolutionQuery,
  ChartRepositorySolutionTaxonomyRecord,
} from "./types.js";

type SolutionSeedAsset = {
  filename?: string;
  type?: string;
  size?: number;
  url?: string;
  attribution?: string;
};

type SolutionSeedItem = {
  slug: string;
  title: string;
  description: string;
  climateHazards?: string[];
  solutionTypes?: string[];
  costOfImplementation?: string;
  usefulLinks?: string[];
  caseStudies?: SolutionSeedAsset[];
  image?: SolutionSeedAsset;
  sourceRecordId?: string;
  sourceUpdatedAt?: string;
  license?: string;
  attribution?: string;
};

type SolutionSeedFile = {
  version: number | string;
  sourceId?: string;
  license?: string;
  attribution?: string;
  items: SolutionSeedItem[];
};

type PayloadContentItem = {
  id: string | number;
  title?: string | null;
  summary?: string | null;
  body?: string | null;
  tag?: string | null;
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

type PayloadListResponse<TDoc> = {
  docs: TDoc[];
  hasNextPage?: boolean;
  nextPage?: number | null;
};

type ChartRepositorySolutionSnapshot = {
  items: ChartRepositorySolutionItemRecord[];
  taxonomies: ChartRepositorySolutionTaxonomyRecord[];
};

type FetchImplementation = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

type ChartRepositorySolutionServiceOptions = {
  env?: NodeJS.ProcessEnv;
  fetch?: FetchImplementation;
};

type TaxonomyType = "hazard" | "solution_type";

const defaultSourceId = "chart-repository";
const defaultSeedCandidates = [
  "api/src/services/chart-repository/seed-data/seed.json",
  "../api/src/services/chart-repository/seed-data/seed.json",
];
const taxonomyAliases: Record<string, string> = {
  cold_wave: "Cold wave",
  energy: "Energy",
  extreme_heat: "Extreme heat",
  floods: "Flood",
  flood: "Flood",
  increased_co2_levels: "Increased CO2 levels",
  increased_temperature: "Increased temperature",
  products_technology: "Products and technology",
  "products technical": "Products and technology",
  sea_level_rise: "Sea level rise",
  service_delivery: "Service delivery",
  technical: "Products and technology",
  technology: "Products and technology",
  wash: "WASH",
  "water sanitation and hygiene": "WASH",
};
const taxonomyIdOverrides: Record<string, string> = {
  "solution_type:products and technology": "solution-type-products-technology",
};

export class ChartRepositorySolutionError extends Error {
  constructor(
    public readonly code: ChartRepositorySolutionErrorCode,
    public readonly statusCode: number,
    message: string = code,
  ) {
    super(message);
  }
}

class ChartRepositoryRemoteError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string = `CHART repository request failed: ${statusCode}`,
  ) {
    super(message);
  }
}

export interface ChartRepositorySolutionService {
  listSolutions(
    query?: ChartRepositorySolutionQuery,
  ): Promise<ChartRepositorySolutionListResponse>;
  getSolutionBySlug(slug: string): Promise<ChartRepositorySolutionItemRecord>;
  listTaxonomies(): Promise<ChartRepositorySolutionTaxonomyRecord[]>;
}

export class ChartRepositoryHazardError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string = code,
  ) {
    super(message);
  }
}

export interface ChartRepositoryHazardService {
  listHazards(): Promise<ChartRepositoryHazardListResponse>;
  getHazardDetail(hazardId: string): Promise<ChartRepositoryHazardDetailResponse>;
}

export function createChartRepositorySolutionService(
  options: ChartRepositorySolutionServiceOptions = {},
): ChartRepositorySolutionService {
  const env = options.env ?? process.env;
  const fetchImplementation = options.fetch ?? fetch;

  return {
    async listSolutions(query = {}) {
      const snapshot = await loadSolutionSnapshot(env, fetchImplementation);
      const items = snapshot.items.filter((item) => matchesQuery(item, query));

      return {
        items: items.slice(0, resolveLimit(query.limit)),
        total: items.length,
      };
    },

    async getSolutionBySlug(slug) {
      const item = (await loadSolutionSnapshot(env, fetchImplementation)).items.find(
        (solution) => solution.slug === slug,
      );

      if (!item) {
        throw new ChartRepositorySolutionError("SOLUTION_NOT_FOUND", 404);
      }

      return item;
    },

    async listTaxonomies() {
      return (await loadSolutionSnapshot(env, fetchImplementation)).taxonomies;
    },
  };
}

export function createChartRepositoryHazardService(
  options: ChartRepositorySolutionServiceOptions = {},
): ChartRepositoryHazardService {
  const env = options.env ?? process.env;
  const fetchImplementation = options.fetch ?? fetch;

  return {
    async listHazards() {
      const repositoryUrl = readRepositoryUrl(env);

      if (repositoryUrl) {
        return fetchRemoteJson<ChartRepositoryHazardListResponse>(
          repositoryUrl,
          "api/public/hazards",
          fetchImplementation,
        );
      }

      return buildHazardList(await loadSeedSolutionSnapshot(env));
    },

    async getHazardDetail(hazardId) {
      const repositoryUrl = readRepositoryUrl(env);

      if (repositoryUrl) {
        const path = `api/public/hazards/${encodeURIComponent(hazardId)}`;

        try {
          return await fetchRemoteJson<ChartRepositoryHazardDetailResponse>(
            repositoryUrl,
            path,
            fetchImplementation,
          );
        } catch (error) {
          if (error instanceof ChartRepositoryRemoteError && error.statusCode === 404) {
            throw new ChartRepositoryHazardError("HAZARD_NOT_FOUND", 404);
          }

          throw error;
        }
      }

      return buildHazardDetail(hazardId, await loadSeedSolutionSnapshot(env));
    },
  };
}

async function loadSolutionSnapshot(
  env: NodeJS.ProcessEnv,
  fetchImplementation: FetchImplementation,
): Promise<ChartRepositorySolutionSnapshot> {
  const repositoryUrl = readRepositoryUrl(env);

  if (repositoryUrl) {
    return loadRemoteSolutionSnapshot(repositoryUrl, fetchImplementation);
  }

  return loadSeedSolutionSnapshot(env);
}

function readRepositoryUrl(env: NodeJS.ProcessEnv) {
  return env.CHART_REPOSITORY_URL?.trim() || undefined;
}

function loadSeedSolutionSnapshot(
  env: NodeJS.ProcessEnv,
): ChartRepositorySolutionSnapshot {
  const seed = readSeedFile(resolveSeedFilePath(env));
  const sourceId = seed.sourceId?.trim() || defaultSourceId;
  const sourceVersion = String(seed.version);
  const items = seed.items.map((item) =>
    mapSeedItem(item, { sourceId, sourceVersion, seed }),
  );
  const taxonomyMap = new Map<string, ChartRepositorySolutionTaxonomyRecord>();

  for (const item of items) {
    for (const taxonomy of item.taxonomies) {
      taxonomyMap.set(taxonomy.id, taxonomy);
    }
  }

  return {
    items,
    taxonomies: [...taxonomyMap.values()].sort(compareTaxonomies),
  };
}

async function loadRemoteSolutionSnapshot(
  repositoryUrl: string,
  fetchImplementation: FetchImplementation,
): Promise<ChartRepositorySolutionSnapshot> {
  const solutionsUrl = "api/public/solutions?limit=100&status=published";
  const [listResponse, taxonomies] = await Promise.all([
    fetchRemoteJson<ChartRepositorySolutionListResponse>(
      repositoryUrl,
      solutionsUrl,
      fetchImplementation,
    ),
    fetchRemoteJson<ChartRepositorySolutionTaxonomyRecord[]>(
      repositoryUrl,
      "api/public/solutions/taxonomies",
      fetchImplementation,
    ),
  ]);

  return {
    items: listResponse.items,
    taxonomies,
  };
}

async function fetchRemoteJson<TResponse>(
  repositoryUrl: string,
  path: string,
  fetchImplementation: FetchImplementation,
) {
  const url = new URL(path, `${trimTrailingSlash(repositoryUrl)}/`);
  const response = await fetchImplementation(url);

  if (!response.ok) {
    throw new ChartRepositoryRemoteError(response.status);
  }

  return (await response.json()) as TResponse;
}

function mapSeedItem(
  item: SolutionSeedItem,
  context: {
    sourceId: string;
    sourceVersion: string;
    seed: SolutionSeedFile;
  },
): ChartRepositorySolutionItemRecord {
  const slug = normalizeSlug(item.slug || item.title);
  const taxonomies = uniqueTaxonomies([
    ...(item.climateHazards ?? [])
      .filter(hasText)
      .map((label) => normalizeTaxonomy("hazard", label)),
    ...(item.solutionTypes ?? [])
      .filter(hasText)
      .map((label) => normalizeTaxonomy("solution_type", label)),
  ]);

  return {
    id: `solution-${slug}`,
    slug,
    name: item.title,
    summary: createSummary(item.description),
    description: item.description,
    implementationNotes: null,
    costOfImplementation: normalizeCost(item.costOfImplementation),
    maintenanceRequirement: null,
    timeToImplement: null,
    evidenceLevel: null,
    sourceId: context.sourceId,
    sourceRecordId: item.sourceRecordId?.trim() || slug,
    sourceVersion: context.sourceVersion,
    sourceUpdatedAt: item.sourceUpdatedAt ?? null,
    license: item.license ?? context.seed.license ?? null,
    attribution: item.attribution ?? context.seed.attribution ?? null,
    status: "published",
    taxonomies,
    links: normalizeLinks(item.usefulLinks),
    assets: normalizeAssets(slug, item),
  };
}

function mapPayloadContentItem(
  doc: PayloadContentItem,
  repositoryUrl: string,
): ChartRepositorySolutionItemRecord {
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
    status: normalizeStatus(doc.workflowState),
    taxonomies,
    links: mapPayloadLinks(doc.usefulLinks),
    assets: normalizePayloadAssets(slug, doc, repositoryUrl),
  };
}

function matchesQuery(
  item: ChartRepositorySolutionItemRecord,
  query: ChartRepositorySolutionQuery,
) {
  return (
    matchesTaxonomy(item, "hazard", query.hazard) &&
    matchesTaxonomy(item, "solution_type", query.solutionType) &&
    matchesCost(item, query.cost) &&
    matchesStatus(item, query.status) &&
    matchesSearch(item, query.search)
  );
}

function buildHazardList(
  snapshot: ChartRepositorySolutionSnapshot,
): ChartRepositoryHazardListResponse {
  const hazardMap = new Map<string, ChartRepositoryHazardItem>();

  for (const item of snapshot.items) {
    for (const taxonomy of item.taxonomies) {
      if (taxonomy.type !== "hazard") {
        continue;
      }

      const existing = hazardMap.get(taxonomy.id);

      hazardMap.set(taxonomy.id, {
        id: taxonomy.id,
        label: taxonomy.label,
        description: existing?.description ?? null,
        hazardGroup: existing?.hazardGroup ?? null,
        imageUrl: existing?.imageUrl ?? null,
        solutionCount: (existing?.solutionCount ?? 0) + 1,
      });
    }
  }

  return {
    items: [...hazardMap.values()].sort((first, second) =>
      first.label.localeCompare(second.label),
    ),
  };
}

function buildHazardDetail(
  hazardId: string,
  snapshot: ChartRepositorySolutionSnapshot,
): ChartRepositoryHazardDetailResponse {
  const hazard = buildHazardList(snapshot).items.find(
    (item) =>
      item.id === hazardId || normalizeSlug(item.label) === normalizeSlug(hazardId),
  );

  if (!hazard) {
    throw new ChartRepositoryHazardError("HAZARD_NOT_FOUND", 404);
  }

  const solutions = snapshot.items
    .filter((item) =>
      item.taxonomies.some(
        (taxonomy) =>
          taxonomy.type === "hazard" &&
          (taxonomy.id === hazard.id ||
            normalizeSlug(taxonomy.label) === normalizeSlug(hazardId)),
      ),
    )
    .map(
      (item): ChartRepositoryHazardSolution => ({
        id: item.id,
        name: item.name,
        slug: item.slug,
        summary: item.summary,
      }),
    );

  return {
    ...hazard,
    solutionCount: solutions.length,
    solutions,
  };
}

function matchesTaxonomy(
  item: ChartRepositorySolutionItemRecord,
  type: TaxonomyType,
  value: string | undefined,
) {
  if (!value?.trim()) {
    return true;
  }

  const normalizedValue = normalizeLookupValue(value);

  return item.taxonomies.some((taxonomy) => {
    return (
      taxonomy.type === type &&
      (taxonomy.id === value ||
        normalizeLookupValue(taxonomy.label) === normalizedValue)
    );
  });
}

function matchesCost(
  item: ChartRepositorySolutionItemRecord,
  value: string | undefined,
) {
  return !value?.trim() || item.costOfImplementation === normalizeCost(value);
}

function matchesStatus(
  item: ChartRepositorySolutionItemRecord,
  value: string | undefined,
) {
  return !value?.trim() || item.status === value;
}

function matchesSearch(
  item: ChartRepositorySolutionItemRecord,
  value: string | undefined,
) {
  const search = value?.trim().toLowerCase();

  if (!search) {
    return true;
  }

  return [item.name, item.summary, item.description].some((text) =>
    text?.toLowerCase().includes(search),
  );
}

function readSeedFile(sourcePath: string) {
  return JSON.parse(readFileSync(sourcePath, "utf8")) as SolutionSeedFile;
}

function resolveSeedFilePath(env: NodeJS.ProcessEnv) {
  const configuredPath = env.CHART_REPOSITORY_SNAPSHOT_FILE;
  const candidates = configuredPath ? [configuredPath] : defaultSeedCandidates;

  for (const candidate of candidates) {
    const sourcePath = resolve(process.cwd(), candidate);

    if (existsSync(sourcePath)) {
      return sourcePath;
    }
  }

  throw new Error("CHART repository snapshot file does not exist.");
}

function normalizeTaxonomy(type: TaxonomyType, value: string) {
  const label = normalizeTaxonomyLabel(value);
  const prefix = type === "hazard" ? "hazard" : "solution-type";
  const overrideKey = `${type}:${normalizeLookupValue(label)}`;

  return {
    id: taxonomyIdOverrides[overrideKey] ?? `${prefix}-${normalizeSlug(label)}`,
    type,
    label,
  };
}

function normalizeTaxonomyLabel(value: string) {
  const trimmedValue = value.trim();
  return taxonomyAliases[normalizeLookupValue(trimmedValue)] ?? trimmedValue;
}

function normalizeLookupValue(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function uniqueTaxonomies(taxonomies: ChartRepositorySolutionTaxonomyRecord[]) {
  const byId = new Map<string, ChartRepositorySolutionTaxonomyRecord>();

  for (const taxonomy of taxonomies) {
    byId.set(taxonomy.id, taxonomy);
  }

  return [...byId.values()].sort(compareTaxonomies);
}

function compareTaxonomies(
  first: ChartRepositorySolutionTaxonomyRecord,
  second: ChartRepositorySolutionTaxonomyRecord,
) {
  return (
    first.type.localeCompare(second.type) || first.label.localeCompare(second.label)
  );
}

function normalizeLinks(values: string[] | undefined) {
  return (values ?? [])
    .map((url): ChartRepositorySolutionItemRecord["links"][number] => ({
      label: url,
      url,
    }))
    .filter((link) => hasText(link.url));
}

function mapPayloadArrayValues(values?: PayloadArrayValue[] | string[] | null) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((value) => (typeof value === "string" ? value : value.value))
    .filter((value): value is string => hasText(value));
}

function mapPayloadLinks(values?: PayloadLink[] | null) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((link): ChartRepositorySolutionItemRecord["links"][number] => {
      const url = link.url?.trim() ?? "";

      return {
        label: link.label?.trim() || url,
        url,
      };
    })
    .filter((link) => hasText(link.url));
}

function normalizeAssets(slug: string, item: SolutionSeedItem) {
  const assets: ChartRepositorySolutionAssetRecord[] = [];

  if (item.image) {
    assets.push(mapAsset(`solution-asset-${slug}-image`, "image", item.image));
  }

  for (const [index, asset] of (item.caseStudies ?? []).entries()) {
    assets.push(
      mapAsset(`solution-asset-${slug}-case-study-${index}`, "case_study", asset),
    );
  }

  return assets;
}

function normalizePayloadAssets(
  slug: string,
  item: PayloadContentItem,
  repositoryUrl: string,
) {
  const assets: ChartRepositorySolutionAssetRecord[] = [];
  const uploadedImage = mapPayloadMedia(item.image, repositoryUrl);
  const externalImage = mapPayloadExternalAsset(item.externalImage, repositoryUrl);
  const coverImage = uploadedImage ?? externalImage;

  if (coverImage) {
    assets.push({
      ...coverImage,
      id: `solution-asset-${slug}-image`,
      kind: "image",
      filename: coverImage.filename || "Cover image",
    });
  }

  for (const [index, asset] of (item.caseStudies ?? []).entries()) {
    const uploadedFile = mapPayloadMedia(asset.file, repositoryUrl);
    const externalFile = mapPayloadExternalAsset(asset, repositoryUrl);
    const caseStudy = uploadedFile ?? externalFile;

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
): Omit<ChartRepositorySolutionAssetRecord, "id" | "kind"> | undefined {
  if (!media || typeof media === "string" || typeof media === "number") {
    return undefined;
  }

  return createPayloadAssetRecord({
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
): Omit<ChartRepositorySolutionAssetRecord, "id" | "kind"> | undefined {
  if (!asset) {
    return undefined;
  }

  return createPayloadAssetRecord({
    filename: asset.filename,
    mimeType: asset.type,
    sizeBytes: asset.size,
    storageUrl: asset.url,
    repositoryUrl,
  });
}

function createPayloadAssetRecord(input: {
  filename?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  storageUrl?: string | null;
  repositoryUrl: string;
}): Omit<ChartRepositorySolutionAssetRecord, "id" | "kind"> | undefined {
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

function mapAsset(
  id: string,
  kind: string,
  asset: SolutionSeedAsset,
): ChartRepositorySolutionAssetRecord {
  return {
    id,
    kind,
    filename: asset.filename ?? "Untitled attachment",
    mimeType: asset.type ?? null,
    sizeBytes: asset.size ?? null,
    storageUrl: asset.url ?? null,
    attribution: asset.attribution ?? null,
  };
}

function normalizeCost(value: string | undefined) {
  const normalizedValue = value?.trim().toLowerCase();

  if (!normalizedValue) {
    return null;
  }

  if (normalizedValue.includes("high") || normalizedValue.includes("💲💲💲")) {
    return "high";
  }

  if (normalizedValue.includes("medium") || normalizedValue.includes("💲💲")) {
    return "medium";
  }

  if (normalizedValue.includes("low") || normalizedValue.includes("💲")) {
    return "low";
  }

  return normalizedValue;
}

function normalizeStatus(value: string | null | undefined) {
  if (value === "published" || value === "review" || value === "scheduled") {
    return value;
  }

  return "draft";
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

function normalizeSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}
