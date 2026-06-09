import { readFileSync } from "node:fs";
import path from "node:path";

import { getPayload } from "payload";

import config from "@payload-config";

import {
  type CostValue,
  costOptions,
  hazardOptions,
  normalizeOptionValue,
  normalizeOptionValues,
  solutionTypeOptions,
} from "./chartRepositoryOptions";
import { hazardSeed, healthImplicationSeed } from "./chartRepositoryTaxonomySeed";

type PayloadClient = Awaited<ReturnType<typeof getPayload>>;

type SolutionSeedAsset = {
  filename?: string;
  type?: string;
  size?: number;
  url?: string;
};

type SolutionSeedItem = {
  slug: string;
  title: string;
  description: string;
  climateHazards: string[];
  solutionTypes: string[];
  costOfImplementation?: string;
  usefulLinks?: string[];
  caseStudies?: SolutionSeedAsset[];
  image?: SolutionSeedAsset;
};

type SolutionSeedFile = {
  version: number;
  items: SolutionSeedItem[];
};

type PayloadRecord = {
  id: string | number;
};

function readSolutionSeed(): SolutionSeedItem[] {
  const sourcePath = path.resolve(
    process.cwd(),
    process.env.CHART_REPOSITORY_SEED_FILE ?? "src/seed-data/seed.json",
  );
  const parsed = JSON.parse(readFileSync(sourcePath, "utf8")) as SolutionSeedFile;

  if (!Array.isArray(parsed.items)) {
    throw new Error("CHART repository seed must contain an items array.");
  }

  return parsed.items;
}

function createSummary(description = "") {
  const summary = description.replace(/\s+/g, " ").trim();

  if (summary.length <= 180) {
    return summary;
  }

  return `${summary.slice(0, 177).trim()}...`;
}

function normalizeUsefulLinks(values?: string[]) {
  return (
    values?.filter(Boolean).map((url) => ({
      label: url
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .split("/")[0],
      url,
    })) ?? []
  );
}

function normalizeCaseStudies(values?: SolutionSeedAsset[]) {
  return (
    values
      ?.filter((asset) => asset.filename || asset.url)
      .map((asset) => ({
        title: asset.filename,
        filename: asset.filename,
        url: asset.url,
        type: asset.type,
        size: asset.size,
      })) ?? []
  );
}

function normalizeSeedCost(value?: string): CostValue | undefined {
  return normalizeOptionValue(value, costOptions) as CostValue | undefined;
}

async function findContentItemByTitle(payload: PayloadClient, title: string) {
  const existing = await payload.find({
    collection: "content-items",
    where: { title: { equals: title } },
    limit: 1,
    overrideAccess: true,
  });

  return existing.docs[0];
}

async function findByExternalId(
  payload: PayloadClient,
  collection: "hazards" | "health-implications",
  externalId: string,
) {
  const existing = await payload.find({
    collection,
    where: { externalId: { equals: externalId } },
    limit: 1,
    overrideAccess: true,
  });

  return existing.docs[0] as PayloadRecord | undefined;
}

async function seedHazards(payload: PayloadClient) {
  const hazardIdsByExternalId = new Map<string, string | number>();

  for (const item of hazardSeed) {
    const existing = await findByExternalId(payload, "hazards", item.externalId);
    const data = {
      externalId: item.externalId,
      slug: item.slug,
      label: item.label,
      hazardGroup: item.hazardGroup,
      active: true,
      sortOrder: item.sortOrder,
    };

    if (existing) {
      const updated = await payload.update({
        collection: "hazards",
        id: existing.id,
        data,
        overrideAccess: true,
      });
      hazardIdsByExternalId.set(item.externalId, updated.id);
      continue;
    }

    const created = await payload.create({
      collection: "hazards",
      data,
      overrideAccess: true,
    });
    hazardIdsByExternalId.set(item.externalId, created.id);
  }

  return hazardIdsByExternalId;
}

async function seedHealthImplications(
  payload: PayloadClient,
  hazardIdsByExternalId: Map<string, string | number>,
) {
  for (const item of healthImplicationSeed) {
    const existing = await findByExternalId(
      payload,
      "health-implications",
      item.externalId,
    );
    const hazardIds = item.hazardExternalIds
      .map((hazardExternalId) => hazardIdsByExternalId.get(hazardExternalId))
      .filter((hazardId): hazardId is string | number => hazardId !== undefined);
    const data = {
      externalId: item.externalId,
      label: item.label,
      impactGroup: item.impactGroup,
      examples: item.examples,
      hazards: hazardIds,
      sortOrder: item.sortOrder,
    };

    if (existing) {
      await payload.update({
        collection: "health-implications",
        id: existing.id,
        data,
        overrideAccess: true,
      });
      continue;
    }

    await payload.create({
      collection: "health-implications",
      data,
      overrideAccess: true,
    });
  }
}

async function upsertSolutionSeedItem(payload: PayloadClient, item: SolutionSeedItem) {
  const solutionTypes = normalizeOptionValues(item.solutionTypes, solutionTypeOptions);
  const climateHazards = normalizeOptionValues(item.climateHazards, hazardOptions);
  const costOfImplementation = normalizeSeedCost(item.costOfImplementation);
  const image = item.image?.url ? item.image : undefined;
  const data = {
    title: item.title,
    tag: solutionTypes[0] ?? solutionTypeOptions[0].value,
    workflowState: "published" as const,
    owner: "CHART repository",
    summary: createSummary(item.description),
    body: item.description,
    externalImage: image,
    solutionTypes,
    climateHazards,
    costOfImplementation,
    usefulLinks: normalizeUsefulLinks(item.usefulLinks),
    caseStudies: normalizeCaseStudies(item.caseStudies),
  };
  const existing = await findContentItemByTitle(payload, item.title);

  if (existing) {
    await payload.update({
      collection: "content-items",
      draft: true,
      id: existing.id,
      data,
      overrideAccess: true,
    });
    return;
  }

  await payload.create({
    collection: "content-items",
    draft: true,
    data,
    overrideAccess: true,
  });
}

async function seedChartContent() {
  const payload = await getPayload({ config });
  const solutionSeedItems = readSolutionSeed();
  const hazardIdsByExternalId = await seedHazards(payload);

  await seedHealthImplications(payload, hazardIdsByExternalId);

  const forceContentSeed = ["1", "true", "yes"].includes(
    process.env.CHART_FORCE_CONTENT_SEED?.toLowerCase() ?? "",
  );
  const contentItems = await payload.find({
    collection: "content-items",
    limit: 1,
    overrideAccess: true,
  });
  const shouldSeedContent = forceContentSeed || contentItems.totalDocs === 0;

  if (shouldSeedContent) {
    for (const item of solutionSeedItems) {
      await upsertSolutionSeedItem(payload, item);
    }
  } else {
    console.log("Content seed skipped because content-items already contains records.");
  }

  console.log(
    shouldSeedContent
      ? `Seed complete. Upserted ${hazardSeed.length} hazards, ${healthImplicationSeed.length} health implications, and ${solutionSeedItems.length} CHART repository items.`
      : `Seed complete. Upserted ${hazardSeed.length} hazards and ${healthImplicationSeed.length} health implications. Existing content was left unchanged.`,
  );
}

await seedChartContent();
