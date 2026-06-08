import assert from "node:assert/strict";
import test from "node:test";

import type { SolutionRepositoryService } from "../solution-repository/service.js";
import type { SolutionRepositoryItemRecord } from "../solution-repository/types.js";
import {
  prepareWorkspaceSolutionImport,
  summarizeWorkspaceSolutionImport,
} from "./service.js";

const heatSolution = createSolution("cooling-centres", [
  { id: "hazard-extreme-heat", type: "hazard", label: "Extreme heat" },
]);
const sharedSolution = createSolution("water-storage", [
  { id: "hazard-extreme-heat", type: "hazard", label: "Extreme heat" },
  { id: "hazard-drought", type: "hazard", label: "Drought" },
]);

test("prepareWorkspaceSolutionImport fetches and de-duplicates selected hazards", async () => {
  const requestedHazards: string[] = [];
  const repositoryService: SolutionRepositoryService = {
    async listSolutions(query) {
      requestedHazards.push(query?.hazard ?? "");

      if (query?.hazard === "hazard-extreme-heat") {
        return { items: [sharedSolution, heatSolution], total: 2 };
      }

      return { items: [sharedSolution], total: 1 };
    },
    async getSolutionBySlug() {
      return heatSolution;
    },
    async listTaxonomies() {
      return [];
    },
  };

  const result = await prepareWorkspaceSolutionImport(
    ["hazard-extreme-heat", "hazard-drought", "hazard-extreme-heat"],
    repositoryService,
  );

  assert.deepEqual(requestedHazards, ["hazard-extreme-heat", "hazard-drought"]);
  assert.deepEqual(
    result.items.map((item) => item.slug),
    ["cooling-centres", "water-storage"],
  );
});

test("summarizeWorkspaceSolutionImport reports setup-facing import status", () => {
  assert.deepEqual(summarizeWorkspaceSolutionImport([], 0), {
    status: "not_started",
    selectedHazards: 0,
    importedSolutions: 0,
    message: "No hazards have been selected for repository import.",
  });

  assert.deepEqual(summarizeWorkspaceSolutionImport(["hazard-flood"], 0), {
    status: "empty",
    selectedHazards: 1,
    importedSolutions: 0,
    message: "No repository actions matched the selected hazards.",
  });

  assert.deepEqual(summarizeWorkspaceSolutionImport(["hazard-flood"], 2), {
    status: "completed",
    selectedHazards: 1,
    importedSolutions: 2,
    message: "2 repository actions were imported for the selected hazards.",
  });
});

function createSolution(
  slug: string,
  taxonomies: SolutionRepositoryItemRecord["taxonomies"],
): SolutionRepositoryItemRecord {
  return {
    id: `solution-${slug}`,
    slug,
    name: slug,
    summary: null,
    description: null,
    implementationNotes: null,
    costOfImplementation: null,
    maintenanceRequirement: null,
    timeToImplement: null,
    evidenceLevel: null,
    sourceId: "chart-solution-repository",
    sourceRecordId: slug,
    sourceVersion: "1",
    sourceUpdatedAt: null,
    license: null,
    attribution: null,
    status: "published",
    taxonomies,
    links: [],
    assets: [],
  };
}
