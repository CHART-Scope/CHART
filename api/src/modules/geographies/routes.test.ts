import assert from "node:assert/strict";
import test from "node:test";

import Fastify from "fastify";

import { GeographyError, type GeographyService } from "./service.js";
import { registerGeographyRoutes } from "./routes.js";

const geography = {
  id: "geo-country-a-region-a",
  countryCode: "CTA",
  level: "geo_level_1" as const,
  levelLabel: "region",
  name: "Region A",
  parentId: "geo-country-a",
  externalCode: null,
  path: "/country-a/region-a",
  sortOrder: 10,
};

test("GET /geographies returns configured geography records", async () => {
  const app = Fastify();
  const service: GeographyService = {
    async listGeographies(query) {
      assert.equal(query?.countryCode, "CTA");
      return [geography];
    },
    async resolveGeography() {
      return geography;
    },
  };

  await app.register(registerGeographyRoutes, { prefix: "/geographies", service });

  const response = await app.inject({
    method: "GET",
    url: "/geographies?countryCode=CTA",
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), [geography]);

  await app.close();
});

test("GET /geographies/resolve resolves a geography path", async () => {
  const app = Fastify();
  const service: GeographyService = {
    async listGeographies() {
      return [];
    },
    async resolveGeography(query) {
      assert.equal(query.path, "/country-a/region-a");
      return geography;
    },
  };

  await app.register(registerGeographyRoutes, { prefix: "/geographies", service });

  const response = await app.inject({
    method: "GET",
    url: "/geographies/resolve?path=%2Fcountry-a%2Fregion-a",
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), geography);

  await app.close();
});

test("GET /geographies/resolve maps missing geography to 404", async () => {
  const app = Fastify();
  const service: GeographyService = {
    async listGeographies() {
      return [];
    },
    async resolveGeography() {
      throw new GeographyError("GEOGRAPHY_NOT_FOUND", 404);
    },
  };

  await app.register(registerGeographyRoutes, { prefix: "/geographies", service });

  const response = await app.inject({
    method: "GET",
    url: "/geographies/resolve?path=%2Fmissing",
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), { error: "GEOGRAPHY_NOT_FOUND" });

  await app.close();
});
