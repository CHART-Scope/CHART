import { readFileSync } from "node:fs";
import path from "node:path";

import { getPayload } from "payload";

import config from "@payload-config";

import { seedContentItems, seedSubmissions as seedSubmissionItems } from "./seedData";
import {
  type CostValue,
  type SolutionTypeValue,
  costOptions,
  hazardOptions,
  normalizeOptionValue,
  normalizeOptionValues,
  solutionTypeOptions,
} from "./solutionRepositoryOptions";

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

function readSolutionSeed(): SolutionSeedItem[] {
  const sourcePath = path.resolve(
    process.cwd(),
    "src/content/solutionRepositorySeed.json",
  );
  const parsed = JSON.parse(readFileSync(sourcePath, "utf8")) as SolutionSeedFile;

  if (!Array.isArray(parsed.items)) {
    throw new Error("Solution repository seed must contain an items array.");
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

async function upsertSolutionSeedItem(payload: PayloadClient, item: SolutionSeedItem) {
  const solutionTypes = normalizeOptionValues(item.solutionTypes, solutionTypeOptions);
  const climateHazards = normalizeOptionValues(item.climateHazards, hazardOptions);
  const costOfImplementation = normalizeSeedCost(item.costOfImplementation);
  const image = item.image?.url ? item.image : undefined;
  const data = {
    title: item.title,
    tag: solutionTypes[0] ?? solutionTypeOptions[0].value,
    workflowState: "review" as const,
    owner: "Solution repository",
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

async function seedDefaultContentItems(payload: PayloadClient) {
  for (const item of seedContentItems) {
    const existing = await findContentItemByTitle(payload, item.title);

    if (existing) {
      continue;
    }

    await payload.create({
      collection: "content-items",
      draft: true,
      data: {
        title: item.title,
        summary: item.summary,
        body: item.body,
        tag: item.tag as SolutionTypeValue,
        workflowState: item.status,
        owner: item.owner,
        scheduledDate: item.scheduledDate,
      },
      overrideAccess: true,
    });
  }
}

async function seedDefaultSubmissions(payload: PayloadClient) {
  const submissions = await payload.find({
    collection: "submissions",
    limit: 1,
    overrideAccess: true,
  });

  if (submissions.totalDocs > 0) {
    return;
  }

  for (const item of seedSubmissionItems) {
    await payload.create({
      collection: "submissions",
      data: {
        organization: item.organization,
        origin: item.origin,
        title: item.title,
        description: item.description,
        tags: item.tags.map((tag: string) => ({ value: tag })),
        received: new Date(item.received).toISOString(),
        state: item.state,
      },
      overrideAccess: true,
    });
  }
}

async function seedChartContent() {
  const payload = await getPayload({ config });
  const solutionSeedItems = readSolutionSeed();
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

    await seedDefaultContentItems(payload);
  } else {
    console.log("Content seed skipped because content-items already contains records.");
  }

  await seedDefaultSubmissions(payload);

  console.log(
    shouldSeedContent
      ? `Seed complete. Upserted ${solutionSeedItems.length} solution repository items.`
      : "Seed complete. Existing content was left unchanged.",
  );
}

await seedChartContent();
