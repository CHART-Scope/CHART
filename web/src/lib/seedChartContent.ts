import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { getPayload } from "payload";

import config from "@payload-config";

import { type ChartCmsAsset } from "./chartContent";
import { seedContentItems, seedSubmissions } from "./seedData";

type AirtableSolutionRecord = {
  airtableId: string;
  createdTime?: string;
  name: string;
  description?: string;
  image?: ChartCmsAsset;
  hazards?: string[];
  solutionTypes?: string[];
  costOfImplementation?: string;
  usefulLinks?: string;
  caseStudies?: ChartCmsAsset[];
  fields?: Record<string, unknown>;
};

function findAirtableSolutionsPath() {
  const candidates = [
    path.resolve(process.cwd(), "../../data/airtable/solutions.normalized.json"),
    path.resolve(process.cwd(), "data/airtable/solutions.normalized.json"),
  ];

  return candidates.find((candidate) => existsSync(candidate));
}

function firstString(values?: unknown) {
  if (Array.isArray(values)) {
    return values.find((value): value is string => typeof value === "string");
  }

  return typeof values === "string" ? values : undefined;
}

function asStringArray(value: unknown) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  return typeof value === "string" ? [value] : [];
}

function asUsefulLinks(value?: string) {
  if (!value) {
    return [];
  }

  return value
    .split(/\s+/)
    .filter((part) => part.startsWith("http"))
    .map((url) => ({ url }));
}

function createSummary(description?: string) {
  if (!description) {
    return "Solution repository item ready for review.";
  }

  const flattened = description.replace(/\s+/g, " ").trim();

  if (flattened.length <= 220) {
    return flattened;
  }

  return `${flattened.slice(0, 217).trim()}...`;
}

function readAirtableSolutions(): AirtableSolutionRecord[] {
  const sourcePath = findAirtableSolutionsPath();

  if (!sourcePath) {
    return [];
  }

  return JSON.parse(readFileSync(sourcePath, "utf8")) as AirtableSolutionRecord[];
}

async function upsertAirtableSolution(
  payload: Awaited<ReturnType<typeof getPayload>>,
  item: AirtableSolutionRecord,
) {
  const fields = item.fields ?? {};
  const picture = Array.isArray(fields.Picture) ? fields.Picture[0] : undefined;
  const image =
    item.image ??
    (picture && typeof picture === "object" ? (picture as ChartCmsAsset) : undefined);
  const solutionType =
    firstString(fields["Solution type"]) ?? firstString(item.solutionTypes);
  const solutionGroup = firstString(fields["Solution group copy"]);
  const implementationEffort = firstString(fields["Implementation effort"]);
  const healthDomains = asStringArray(fields["Health domains"]);
  const resiliencePhases = asStringArray(fields["Resilience Phase"]);
  const organizationName = firstString(fields["Organization / individual name"]);
  const contactInformation = firstString(fields["Contact information"]);
  const existing = await payload.find({
    collection: "content-items",
    where: {
      and: [
        { externalSource: { equals: "airtable" } },
        { externalId: { equals: item.airtableId } },
      ],
    },
    limit: 1,
    overrideAccess: true,
  });
  const data = {
    type: "solution" as const,
    title: item.name,
    tag: solutionType ?? "Solution",
    workflowState: "review" as const,
    owner: organizationName ?? "Solution repository",
    summary: createSummary(item.description),
    body: item.description ?? "",
    externalSource: "airtable",
    externalId: item.airtableId,
    sourceTable: "Initial prototype solutions",
    externalImage: image,
    solutionType,
    solutionGroup,
    climateHazards: (item.hazards ?? []).map((value) => ({ value })),
    healthDomains: healthDomains.map((value) => ({ value })),
    resiliencePhases: resiliencePhases.map((value) => ({ value })),
    costOfImplementation: item.costOfImplementation,
    implementationEffort,
    usefulLinks: asUsefulLinks(item.usefulLinks),
    caseStudies: (item.caseStudies ?? []).map((asset) => ({
      title: asset.filename,
      filename: asset.filename,
      url: asset.url,
      type: asset.type,
      size: asset.size,
    })),
    organizationName,
    contactInformation,
  };

  if (existing.docs[0]) {
    await payload.update({
      collection: "content-items",
      id: existing.docs[0].id,
      data,
      overrideAccess: true,
    });
    return;
  }

  await payload.create({
    collection: "content-items",
    data,
    overrideAccess: true,
  });
}

async function seedChartContent() {
  const payload = await getPayload({ config });
  const airtableSolutions = readAirtableSolutions();

  const contentItems = await payload.find({
    collection: "content-items",
    limit: 1,
    overrideAccess: true,
  });

  if (airtableSolutions.length > 0) {
    for (const item of airtableSolutions) {
      await upsertAirtableSolution(payload, item);
    }
  }

  if (contentItems.totalDocs === 0) {
    for (const item of seedContentItems) {
      await payload.create({
        collection: "content-items",
        data: {
          title: item.title,
          summary: item.summary,
          body: item.body,
          type: item.type,
          tag: item.tag,
          workflowState: item.status,
          owner: item.owner,
          scheduledDate: item.scheduledDate,
          sourceTable: "Seed content",
        },
        overrideAccess: true,
      });
    }
  }

  const submissions = await payload.find({
    collection: "submissions",
    limit: 1,
    overrideAccess: true,
  });

  if (submissions.totalDocs === 0) {
    for (const item of seedSubmissions) {
      await payload.create({
        collection: "submissions",
        data: {
          organization: item.organization,
          origin: item.origin,
          title: item.title,
          description: item.description,
          tags: item.tags.map((tag) => ({ value: tag })),
          received: new Date(item.received).toISOString(),
          state: item.state,
        },
        overrideAccess: true,
      });
    }
  }

  console.log(
    `Seed complete. Imported ${airtableSolutions.length} Airtable solutions.`,
  );
}

await seedChartContent();
