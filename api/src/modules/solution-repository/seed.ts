import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { eq, sql } from "drizzle-orm";

import { db } from "../../db/client.js";
import {
  solutionRepositoryAssets,
  solutionRepositoryItems,
  solutionRepositoryItemTaxonomies,
  solutionRepositoryLinks,
  solutionRepositoryTaxonomies,
} from "../../db/schema.js";

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

export type SolutionRepositorySeedResult = {
  status: "imported" | "skipped";
  sourcePath?: string;
  importedItems: number;
};

const defaultSourceId = "chart-solution-repository";
const defaultSeedCandidates = [
  "../web/src/content/solutionRepositorySeed.json",
  "web/src/content/solutionRepositorySeed.json",
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

export async function importSolutionRepositorySeedFile(
  seedFilePath = process.env.CHART_SOLUTION_REPOSITORY_SEED_FILE,
): Promise<SolutionRepositorySeedResult> {
  const sourcePath = resolveSeedFilePath(seedFilePath);

  if (!sourcePath) {
    return { status: "skipped", importedItems: 0 };
  }

  const seed = readSeedFile(sourcePath);
  const importedItems = await importSolutionRepositorySeed(seed);

  return { status: "imported", sourcePath, importedItems };
}

async function importSolutionRepositorySeed(seed: SolutionSeedFile) {
  if (!Array.isArray(seed.items)) {
    throw new Error("Solution repository seed must contain an items array.");
  }

  const sourceId = seed.sourceId?.trim() || defaultSourceId;
  const sourceVersion = String(seed.version);

  await db.transaction(async (tx) => {
    for (const item of seed.items) {
      const title = requireText(item.title, "Solution repository seed item title");
      const description = item.description ?? "";
      const slug = normalizeSlug(item.slug || title);

      if (!slug) {
        throw new Error(`Solution repository seed item has an invalid slug: ${title}`);
      }

      const solutionId = solutionIdForSlug(slug);
      const taxonomies = uniqueTaxonomies([
        ...(item.climateHazards ?? [])
          .filter(hasText)
          .map((label) => normalizeTaxonomy("hazard", label)),
        ...(item.solutionTypes ?? [])
          .filter(hasText)
          .map((label) => normalizeTaxonomy("solution_type", label)),
      ]);

      for (const taxonomy of taxonomies) {
        await tx
          .insert(solutionRepositoryTaxonomies)
          .values(taxonomy)
          .onConflictDoUpdate({
            target: solutionRepositoryTaxonomies.id,
            set: {
              type: sql`excluded.type`,
              label: sql`excluded.label`,
              updatedAt: sql`now()`,
            },
          });
      }

      await tx
        .insert(solutionRepositoryItems)
        .values({
          id: solutionId,
          slug,
          name: title,
          summary: createSummary(description),
          description,
          costOfImplementation: normalizeCost(item.costOfImplementation),
          sourceId,
          sourceRecordId: item.sourceRecordId?.trim() || slug,
          sourceVersion,
          sourceUpdatedAt: parseOptionalDate(item.sourceUpdatedAt),
          license: item.license ?? seed.license ?? null,
          attribution: item.attribution ?? seed.attribution ?? null,
          status: "imported",
        })
        .onConflictDoUpdate({
          target: solutionRepositoryItems.slug,
          set: {
            name: sql`excluded.name`,
            summary: sql`excluded.summary`,
            description: sql`excluded.description`,
            costOfImplementation: sql`excluded.cost_of_implementation`,
            sourceId: sql`excluded.source_id`,
            sourceRecordId: sql`excluded.source_record_id`,
            sourceVersion: sql`excluded.source_version`,
            sourceUpdatedAt: sql`excluded.source_updated_at`,
            license: sql`excluded.license`,
            attribution: sql`excluded.attribution`,
            status: sql`excluded.status`,
            updatedAt: sql`now()`,
          },
        });

      await tx
        .delete(solutionRepositoryItemTaxonomies)
        .where(eq(solutionRepositoryItemTaxonomies.solutionId, solutionId));
      await tx
        .delete(solutionRepositoryLinks)
        .where(eq(solutionRepositoryLinks.solutionId, solutionId));
      await tx
        .delete(solutionRepositoryAssets)
        .where(eq(solutionRepositoryAssets.solutionId, solutionId));

      if (taxonomies.length > 0) {
        await tx.insert(solutionRepositoryItemTaxonomies).values(
          taxonomies.map((taxonomy) => ({
            solutionId,
            taxonomyId: taxonomy.id,
          })),
        );
      }

      const links = normalizeLinks(solutionId, item.usefulLinks);
      if (links.length > 0) {
        await tx.insert(solutionRepositoryLinks).values(links);
      }

      const assets = normalizeAssets(solutionId, slug, item);
      if (assets.length > 0) {
        await tx.insert(solutionRepositoryAssets).values(assets);
      }
    }
  });

  return seed.items.length;
}

function readSeedFile(sourcePath: string) {
  return JSON.parse(readFileSync(sourcePath, "utf8")) as SolutionSeedFile;
}

function resolveSeedFilePath(seedFilePath: string | undefined) {
  const candidates = seedFilePath ? [seedFilePath] : defaultSeedCandidates;

  for (const candidate of candidates) {
    const sourcePath = resolve(process.cwd(), candidate);

    if (existsSync(sourcePath)) {
      return sourcePath;
    }
  }

  if (seedFilePath) {
    throw new Error(`Solution repository seed file does not exist: ${seedFilePath}`);
  }

  return undefined;
}

function normalizeTaxonomy(type: "hazard" | "solution_type", value: string) {
  const label = normalizeTaxonomyLabel(value);
  const prefix = type === "hazard" ? "hazard" : "solution-type";
  const overrideKey = `${type}:${normalizeLookupValue(label)}`;

  return {
    id: taxonomyIdOverrides[overrideKey] ?? `${prefix}-${normalizeSlug(label)}`,
    type,
    label,
  };
}

function hasText(value: string) {
  return value.trim().length > 0;
}

function requireText(value: string, fieldName: string) {
  const trimmed = value?.trim();

  if (!trimmed) {
    throw new Error(`${fieldName} is required.`);
  }

  return trimmed;
}

function uniqueTaxonomies(taxonomies: ReturnType<typeof normalizeTaxonomy>[]) {
  return [...new Map(taxonomies.map((taxonomy) => [taxonomy.id, taxonomy])).values()];
}

function normalizeTaxonomyLabel(value: string) {
  const trimmed = value.trim();
  const lookup = normalizeLookupValue(trimmed);

  return taxonomyAliases[lookup] ?? trimmed;
}

function normalizeCost(value: string | undefined) {
  if (!value) {
    return null;
  }

  const normalized = normalizeLookupValue(value);

  if (normalized.includes("variable")) {
    return "variable";
  }

  if (normalized.includes("high") || normalized.includes("3")) {
    return "high";
  }

  if (normalized.includes("medium") || normalized.includes("2")) {
    return "medium";
  }

  if (normalized.includes("low") || normalized.includes("1")) {
    return "low";
  }

  return normalized.replace(/\s+/g, "_");
}

function normalizeLinks(solutionId: string, links: string[] | undefined) {
  return (
    links
      ?.map((url) => url.trim())
      .filter(Boolean)
      .map((url, index) => ({
        id: `${solutionId}-link-${index + 1}`,
        solutionId,
        label: createLinkLabel(url),
        url,
        sortOrder: index,
      })) ?? []
  );
}

function normalizeAssets(solutionId: string, slug: string, item: SolutionSeedItem) {
  const caseStudyAssets =
    item.caseStudies?.map((asset, index) => ({
      id: `${solutionId}-case-study-${index + 1}`,
      solutionId,
      kind: "case_study",
      filename: asset.filename || `${slug}-case-study-${index + 1}`,
      mimeType: asset.type ?? null,
      sizeBytes: asset.size ?? null,
      storageUrl: asset.url ?? null,
      attribution: asset.attribution ?? null,
      sortOrder: index,
    })) ?? [];

  if (!item.image) {
    return caseStudyAssets;
  }

  return [
    {
      id: `${solutionId}-image`,
      solutionId,
      kind: "image",
      filename: item.image.filename || `${slug}-image`,
      mimeType: item.image.type ?? null,
      sizeBytes: item.image.size ?? null,
      storageUrl: item.image.url ?? null,
      attribution: item.image.attribution ?? null,
      sortOrder: -1,
    },
    ...caseStudyAssets,
  ];
}

function createSummary(description = "") {
  const summary = description.replace(/\s+/g, " ").trim();

  if (summary.length <= 180) {
    return summary;
  }

  return `${summary.slice(0, 177).trim()}...`;
}

function createLinkLabel(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "Reference";
  }
}

function parseOptionalDate(value: string | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function solutionIdForSlug(slug: string) {
  return `solution-${slug}`;
}

function normalizeSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeLookupValue(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
