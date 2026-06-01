import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildApp } from "./app.js";
import { writeOpenApiYaml } from "./openapi.js";

test("GET /api returns the interactive Swagger API page", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "GET",
    url: "/api",
  });

  assert.equal(response.statusCode, 200);
  assert.match(String(response.headers["content-type"]), /text\/html/);
  assert.match(response.body, /SwaggerUIBundle/);
  assert.match(response.body, /currentPath \+ "\/openapi\.json"/);

  await app.close();
});

test("GET /openapi.json returns the current API contract as JSON", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "GET",
    url: "/openapi.json",
  });

  assert.equal(response.statusCode, 200);
  assert.match(String(response.headers["content-type"]), /application\/json/);

  const body = response.json();
  assert.equal(body.openapi, "3.0.3");
  assert.equal(body.info.title, "CHART API");
  assert.deepEqual(body.servers, [{ url: "." }]);
  assert.ok(body.paths["/auth/me"]);
  assert.equal(body.paths["/auth/me"].get.operationId, "getCurrentUser");
  assert.deepEqual(body.paths["/auth/me"].get.security, [{ bearerAuth: [] }]);
  assert.equal(body.components.securitySchemes.bearerAuth.bearerFormat, "JWT");

  await app.close();
});

test("GET /openapi.yaml returns the current API contract as YAML", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "GET",
    url: "/openapi.yaml",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["content-type"], "application/yaml");
  assert.match(response.body, /openapi: "3\.0\.3"/);
  assert.match(response.body, /operationId: "getCurrentUser"/);
  assert.match(response.body, /bearerFormat: "JWT"/);
  assert.match(response.body, /\/auth\/me:/);
  assert.match(response.body, /Current authenticated user context/);

  await app.close();
});

test("writeOpenApiYaml writes the current contract to a YAML file", async () => {
  const tempDirectory = await mkdtemp(join(tmpdir(), "chart-openapi-"));
  const outputPath = join(tempDirectory, "openapi.yaml");

  await writeOpenApiYaml(outputPath);

  const output = await readFile(outputPath, "utf8");
  assert.match(output, /title: "CHART API"/);
  assert.match(output, /\/sources\/\{sourceId\}\/sync:/);
});
