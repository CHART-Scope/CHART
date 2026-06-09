import assert from "node:assert/strict";
import test from "node:test";

import Fastify from "fastify";

import { registerSolutionRoutes } from "./routes.js";
import {
  ChartRepositorySolutionError,
  type ChartRepositorySolutionService,
} from "../../services/chart-repository/service.js";
import type { ChartRepositorySolutionItemRecord } from "../../services/chart-repository/types.js";

const solution: ChartRepositorySolutionItemRecord = {
  id: "solution-cool-roof",
  slug: "cool-roof",
  name: "Cool roof",
  summary: "Reflective roofing for reducing facility heat exposure.",
  description: "Apply reflective roof coating to reduce indoor heat exposure.",
  implementationNotes: null,
  costOfImplementation: "low",
  maintenanceRequirement: null,
  timeToImplement: null,
  evidenceLevel: null,
  sourceId: "chart-repository",
  sourceRecordId: "cool-roof",
  sourceVersion: "1",
  sourceUpdatedAt: null,
  license: "CC-BY-4.0",
  attribution: "CHART repository",
  status: "published",
  taxonomies: [
    { id: "hazard-extreme-heat", type: "hazard", label: "Extreme heat" },
    {
      id: "solution-type-infrastructure",
      type: "solution_type",
      label: "Infrastructure",
    },
  ],
  links: [{ label: "Reference", url: "https://example.org/cool-roof" }],
  assets: [],
};

test("GET /solutions returns filtered CHART repository items", async () => {
  const app = Fastify();
  const service: ChartRepositorySolutionService = {
    async listSolutions(query) {
      assert.equal(query?.hazard, "extreme_heat");
      assert.equal(query?.solutionType, "infrastructure");
      return { items: [solution], total: 1 };
    },
    async getSolutionBySlug() {
      return solution;
    },
    async listTaxonomies() {
      return [];
    },
  };

  await app.register(registerSolutionRoutes, {
    prefix: "/solutions",
    service,
  });

  const response = await app.inject({
    method: "GET",
    url: "/solutions?hazard=extreme_heat&solutionType=infrastructure",
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { items: [solution], total: 1 });

  await app.close();
});

test("GET /solutions/taxonomies returns repository facets", async () => {
  const app = Fastify();
  const service: ChartRepositorySolutionService = {
    async listSolutions() {
      return { items: [], total: 0 };
    },
    async getSolutionBySlug() {
      return solution;
    },
    async listTaxonomies() {
      return [{ id: "hazard-extreme-heat", type: "hazard", label: "Extreme heat" }];
    },
  };

  await app.register(registerSolutionRoutes, {
    prefix: "/solutions",
    service,
  });

  const response = await app.inject({
    method: "GET",
    url: "/solutions/taxonomies",
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), [
    { id: "hazard-extreme-heat", type: "hazard", label: "Extreme heat" },
  ]);

  await app.close();
});

test("GET /solutions/:slug returns one solution", async () => {
  const app = Fastify();
  const service: ChartRepositorySolutionService = {
    async listSolutions() {
      return { items: [], total: 0 };
    },
    async getSolutionBySlug(slug) {
      assert.equal(slug, "cool-roof");
      return solution;
    },
    async listTaxonomies() {
      return [];
    },
  };

  await app.register(registerSolutionRoutes, {
    prefix: "/solutions",
    service,
  });

  const response = await app.inject({
    method: "GET",
    url: "/solutions/cool-roof",
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), solution);

  await app.close();
});

test("GET /solutions/:slug maps missing solution to 404", async () => {
  const app = Fastify();
  const service: ChartRepositorySolutionService = {
    async listSolutions() {
      return { items: [], total: 0 };
    },
    async getSolutionBySlug() {
      throw new ChartRepositorySolutionError("SOLUTION_NOT_FOUND", 404);
    },
    async listTaxonomies() {
      return [];
    },
  };

  await app.register(registerSolutionRoutes, {
    prefix: "/solutions",
    service,
  });

  const response = await app.inject({
    method: "GET",
    url: "/solutions/missing",
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), { error: "SOLUTION_NOT_FOUND" });

  await app.close();
});
