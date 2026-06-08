import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type {
  SolutionRepositoryAssetRecord,
  SolutionRepositoryErrorCode,
  SolutionRepositoryItemRecord,
  SolutionRepositoryListResponse,
  SolutionRepositoryQuery,
  SolutionRepositoryTaxonomyRecord,
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

type TaxonomyType = "hazard" | "solution_type";

const defaultSourceId = "chart-solution-repository";
const defaultSeedCandidates = [
  "api/src/modules/solution-repository/seed-data/seed.json",
  "../api/src/modules/solution-repository/seed-data/seed.json",
];
const taxonomyAliases: Record<string, string> = {
  floods: "Flood",
  "products technical": "Products and technology",
  technical: "Products and technology",
  technology: "Products and technology",
  "water sanitation and hygiene": "WASH",
};
const taxonomyIdOverrides: Record<string, string> = {
  "solution_type:products and technology": "solution-type-products-technology",
};

export class SolutionRepositoryError extends Error {
  constructor(
    public readonly code: SolutionRepositoryErrorCode,
    public readonly statusCode: number,
    message: string = code,
  ) {
    super(message);
  }
}

export interface SolutionRepositoryService {
  listSolutions(
    query?: SolutionRepositoryQuery,
  ): Promise<SolutionRepositoryListResponse>;
  getSolutionBySlug(slug: string): Promise<SolutionRepositoryItemRecord>;
  listTaxonomies(): Promise<SolutionRepositoryTaxonomyRecord[]>;
}

export function createSolutionRepositoryService(): SolutionRepositoryService {
  return {
    async listSolutions(query = {}) {
      const snapshot = loadSolutionSnapshot();
      const items = snapshot.items.filter((item) => matchesQuery(item, query));

      return {
        items: items.slice(0, resolveLimit(query.limit)),
        total: items.length,
      };
    },

    async getSolutionBySlug(slug) {
      const item = loadSolutionSnapshot().items.find(
        (solution) => solution.slug === slug,
      );

      if (!item) {
        throw new SolutionRepositoryError("SOLUTION_NOT_FOUND", 404);
      }

      return item;
    },

    async listTaxonomies() {
      return loadSolutionSnapshot().taxonomies;
    },
  };
}

function loadSolutionSnapshot() {
  const seed = readSeedFile(resolveSeedFilePath());
  const sourceId = seed.sourceId?.trim() || defaultSourceId;
  const sourceVersion = String(seed.version);
  const items = seed.items.map((item) =>
    mapSeedItem(item, { sourceId, sourceVersion, seed }),
  );
  const taxonomyMap = new Map<string, SolutionRepositoryTaxonomyRecord>();

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

function mapSeedItem(
  item: SolutionSeedItem,
  context: {
    sourceId: string;
    sourceVersion: string;
    seed: SolutionSeedFile;
  },
): SolutionRepositoryItemRecord {
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

function matchesQuery(
  item: SolutionRepositoryItemRecord,
  query: SolutionRepositoryQuery,
) {
  return (
    matchesTaxonomy(item, "hazard", query.hazard) &&
    matchesTaxonomy(item, "solution_type", query.solutionType) &&
    matchesCost(item, query.cost) &&
    matchesStatus(item, query.status) &&
    matchesSearch(item, query.search)
  );
}

function matchesTaxonomy(
  item: SolutionRepositoryItemRecord,
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

function matchesCost(item: SolutionRepositoryItemRecord, value: string | undefined) {
  return !value?.trim() || item.costOfImplementation === normalizeCost(value);
}

function matchesStatus(item: SolutionRepositoryItemRecord, value: string | undefined) {
  return !value?.trim() || item.status === value;
}

function matchesSearch(item: SolutionRepositoryItemRecord, value: string | undefined) {
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

function resolveSeedFilePath() {
  const configuredPath = process.env.CHART_SOLUTION_REPOSITORY_SNAPSHOT_FILE;
  const candidates = configuredPath ? [configuredPath] : defaultSeedCandidates;

  for (const candidate of candidates) {
    const sourcePath = resolve(process.cwd(), candidate);

    if (existsSync(sourcePath)) {
      return sourcePath;
    }
  }

  throw new Error("Solution repository snapshot file does not exist.");
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

function uniqueTaxonomies(taxonomies: SolutionRepositoryTaxonomyRecord[]) {
  const byId = new Map<string, SolutionRepositoryTaxonomyRecord>();

  for (const taxonomy of taxonomies) {
    byId.set(taxonomy.id, taxonomy);
  }

  return [...byId.values()].sort(compareTaxonomies);
}

function compareTaxonomies(
  first: SolutionRepositoryTaxonomyRecord,
  second: SolutionRepositoryTaxonomyRecord,
) {
  return (
    first.type.localeCompare(second.type) || first.label.localeCompare(second.label)
  );
}

function normalizeLinks(values: string[] | undefined) {
  return (values ?? [])
    .map((url): SolutionRepositoryItemRecord["links"][number] => ({
      label: url,
      url,
    }))
    .filter((link) => hasText(link.url));
}

function normalizeAssets(slug: string, item: SolutionSeedItem) {
  const assets: SolutionRepositoryAssetRecord[] = [];

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

function mapAsset(
  id: string,
  kind: string,
  asset: SolutionSeedAsset,
): SolutionRepositoryAssetRecord {
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

function hasText(value: string | undefined) {
  return Boolean(value?.trim());
}
