import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildApp } from "./app.js";
import { writeOpenApiYaml } from "./openapi.js";

test("GET /openapi.yaml returns the current API contract as YAML", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "GET",
    url: "/openapi.yaml",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["content-type"], "application/yaml");
  assert.match(response.body, /openapi: "3\.0\.3"/);
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
