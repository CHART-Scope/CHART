import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";

import { db } from "../../db/client.js";
import { workspaceSolutionHazards, workspaceSolutionRecords } from "../../db/schema.js";
import {
  createSolutionRepositoryService,
  type SolutionRepositoryService,
} from "../solution-repository/service.js";
import type { SolutionRepositoryItemRecord } from "../solution-repository/types.js";
import type {
  PreparedWorkspaceSolutionImport,
  WorkspaceSolutionImportSummary,
} from "./types.js";

type WorkspaceSolutionWriter = Pick<typeof db, "delete" | "insert">;

export async function prepareWorkspaceSolutionImport(
  hazardIds: string[],
  repositoryService: SolutionRepositoryService = createSolutionRepositoryService(),
): Promise<PreparedWorkspaceSolutionImport> {
  const selectedHazardIds = uniqueValues(hazardIds);
  const solutionsByKey = new Map<string, SolutionRepositoryItemRecord>();

  for (const hazardId of selectedHazardIds) {
    const response = await repositoryService.listSolutions({
      hazard: hazardId,
      status: "published",
      limit: 100,
    });

    for (const item of response.items) {
      solutionsByKey.set(`${item.sourceId}:${item.slug}`, item);
    }
  }

  return {
    hazardIds: selectedHazardIds,
    items: [...solutionsByKey.values()].sort((first, second) =>
      first.name.localeCompare(second.name),
    ),
  };
}

export async function replaceWorkspaceSolutions(
  writer: WorkspaceSolutionWriter,
  workspaceId: string,
  preparedImport: PreparedWorkspaceSolutionImport,
): Promise<WorkspaceSolutionImportSummary> {
  await writer
    .delete(workspaceSolutionRecords)
    .where(eq(workspaceSolutionRecords.workspaceId, workspaceId));

  if (preparedImport.items.length === 0) {
    return buildImportSummary(preparedImport);
  }

  const solutionRows = preparedImport.items.map((item) => ({
    id: createWorkspaceSolutionId(workspaceId, item),
    workspaceId,
    sourceId: item.sourceId,
    sourceRecordId: item.sourceRecordId,
    sourceVersion: item.sourceVersion,
    sourceUpdatedAt: item.sourceUpdatedAt,
    slug: item.slug,
    name: item.name,
    summary: item.summary,
    description: item.description,
    costOfImplementation: item.costOfImplementation,
    status: item.status,
    license: item.license,
    attribution: item.attribution,
    taxonomies: item.taxonomies,
    links: item.links,
    assets: item.assets,
  }));

  await writer.insert(workspaceSolutionRecords).values(solutionRows);

  const selectedHazards = new Set(preparedImport.hazardIds);
  const hazardRows = preparedImport.items.flatMap((item) => {
    const solutionRecordId = createWorkspaceSolutionId(workspaceId, item);

    return item.taxonomies
      .filter(
        (taxonomy) => taxonomy.type === "hazard" && selectedHazards.has(taxonomy.id),
      )
      .map((taxonomy) => ({
        workspaceId,
        solutionRecordId,
        hazardId: taxonomy.id,
      }));
  });

  if (hazardRows.length > 0) {
    await writer.insert(workspaceSolutionHazards).values(hazardRows);
  }

  return buildImportSummary(preparedImport);
}

export function buildImportSummary(
  preparedImport: PreparedWorkspaceSolutionImport,
): WorkspaceSolutionImportSummary {
  return summarizeWorkspaceSolutionImport(
    preparedImport.hazardIds,
    preparedImport.items.length,
  );
}

export function summarizeWorkspaceSolutionImport(
  hazardIds: string[],
  importedSolutions: number,
): WorkspaceSolutionImportSummary {
  const selectedHazards = uniqueValues(hazardIds).length;

  if (selectedHazards === 0) {
    return {
      status: "not_started",
      selectedHazards,
      importedSolutions,
      message: "No hazards have been selected for repository import.",
    };
  }

  if (importedSolutions === 0) {
    return {
      status: "empty",
      selectedHazards,
      importedSolutions,
      message: "No repository actions matched the selected hazards.",
    };
  }

  return {
    status: "completed",
    selectedHazards,
    importedSolutions,
    message: `${importedSolutions} repository actions were imported for the selected hazards.`,
  };
}

function createWorkspaceSolutionId(
  workspaceId: string,
  item: SolutionRepositoryItemRecord,
) {
  const stableKey = `${workspaceId}:${item.sourceId}:${item.slug}`;
  const digest = createHash("sha256").update(stableKey).digest("hex").slice(0, 24);

  return `workspace-solution-${digest}`;
}

function uniqueValues(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
