import test from "node:test";
import assert from "node:assert/strict";

import { buildApp } from "../../app.js";

test("GET /sources returns configured source metadata", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "GET",
    url: "/sources"
  });

  assert.equal(response.statusCode, 200);

  const body = response.json();
  assert.ok(Array.isArray(body));
  assert.ok(body.length > 0);
  assert.equal(body[0].id, "climate-era5");

  await app.close();
});

test("GET /sources/:sourceId returns 404 for an unknown source", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "GET",
    url: "/sources/unknown"
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), { error: "SOURCE_NOT_FOUND" });

  await app.close();
});

test("POST /sources/:sourceId/sync queues a source sync", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "POST",
    url: "/sources/climate-era5/sync"
  });

  assert.equal(response.statusCode, 202);
  assert.deepEqual(response.json(), {
    sourceId: "climate-era5",
    status: "queued"
  });

  await app.close();
});
