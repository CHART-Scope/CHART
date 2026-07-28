import assert from "node:assert/strict";
import test from "node:test";

import Fastify from "fastify";

import { registerHazardRoutes } from "./routes.js";
import {
  ChartRepositoryHazardError,
  type ChartRepositoryHazardService,
} from "../../services/chart-repository/service.js";
import type {
  ChartRepositoryHazardDetailResponse,
  ChartRepositoryHazardListResponse,
} from "../../services/chart-repository/types.js";

const hazard = {
  id: "hazard-extreme-heat",
  label: "Extreme heat",
  description: "Periods of unusually high temperatures.",
  hazardGroup: "meteorological",
  imageUrl: null,
  solutionCount: 1,
} satisfies ChartRepositoryHazardListResponse["items"][number];

const hazardDetail = {
  ...hazard,
  solutions: [
    {
      id: "solution-cooling-centres",
      name: "Cooling centres",
      slug: "cooling-centres",
      summary: "Open public cooling centres during heat events.",
    },
  ],
} satisfies ChartRepositoryHazardDetailResponse;

test("GET /hazards returns chart repository hazards", async () => {
  const app = Fastify();
  const service: ChartRepositoryHazardService = {
    async listHazards() {
      return {
        items: [hazard],
      };
    },
    async getHazardDetail() {
      return hazardDetail;
    },
  };

  await app.register(registerHazardRoutes, {
    prefix: "/hazards",
    service,
  });

  const response = await app.inject({
    method: "GET",
    url: "/hazards",
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    items: [hazard],
  });

  await app.close();
});

test("GET /hazards/:hazardId returns one chart repository hazard", async () => {
  const app = Fastify();
  const service: ChartRepositoryHazardService = {
    async listHazards() {
      return { items: [] };
    },
    async getHazardDetail(hazardId) {
      assert.equal(hazardId, "hazard-extreme-heat");
      return hazardDetail;
    },
  };

  await app.register(registerHazardRoutes, {
    prefix: "/hazards",
    service,
  });

  const response = await app.inject({
    method: "GET",
    url: "/hazards/hazard-extreme-heat",
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), hazardDetail);

  await app.close();
});

test("GET /hazards/:hazardId maps missing hazard to 404", async () => {
  const app = Fastify();
  const service: ChartRepositoryHazardService = {
    async listHazards() {
      return { items: [] };
    },
    async getHazardDetail() {
      throw new ChartRepositoryHazardError("HAZARD_NOT_FOUND", 404);
    },
  };

  await app.register(registerHazardRoutes, {
    prefix: "/hazards",
    service,
  });

  const response = await app.inject({
    method: "GET",
    url: "/hazards/missing",
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), { error: "HAZARD_NOT_FOUND" });

  await app.close();
});
