import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { buildApp } from "./app.js";

export async function buildOpenApiDocument() {
  const app = buildApp();

  try {
    await app.ready();
    return app.swagger();
  } finally {
    await app.close();
  }
}

export async function buildOpenApiYaml() {
  const app = buildApp();

  try {
    await app.ready();
    return app.swagger({ yaml: true });
  } finally {
    await app.close();
  }
}

export async function writeOpenApiYaml(
  outputPath = resolve(process.cwd(), "openapi.yaml"),
) {
  const yaml = await buildOpenApiYaml();

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, yaml, "utf8");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await writeOpenApiYaml();
}
