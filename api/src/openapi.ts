import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  getCurrentUserRouteSchema,
  getGeographyAccessRouteSchema,
} from "./modules/auth/routes.js";
import {
  authErrorResponseSchema,
  currentUserContextSchema,
  geographyAccessResponseSchema,
} from "./modules/auth/types.js";
import {
  getSourceRouteSchema,
  listSourcesRouteSchema,
  queueSourceSyncRouteSchema,
} from "./modules/data-ingestion/routes.js";
import {
  errorResponseSchema,
  sourceIdParamsSchema,
  sourceMetadataSchema,
  sourceSyncResultSchema,
} from "./modules/data-ingestion/types.js";

const jsonContentType = "application/json";

const healthResponseSchema = {
  type: "object",
  required: ["status"],
  properties: {
    status: { type: "string" },
  },
} as const;

export function buildOpenApiDocument() {
  return {
    openapi: "3.0.3",
    info: {
      title: "CHART API",
      version: "0.1.0",
      description: "Current contract for CHART backend modules.",
    },
    tags: [
      { name: "system", description: "System health and API contract routes" },
      { name: "auth", description: "Current user role and geography context" },
      {
        name: "data-ingestion",
        description: "Configured data source metadata and sync actions",
      },
    ],
    paths: {
      "/health": {
        get: {
          tags: ["system"],
          operationId: "getHealth",
          summary: "Check API health",
          responses: {
            "200": response("API is available", healthResponseSchema),
          },
        },
      },
      "/api": {
        get: {
          tags: ["system"],
          operationId: "getApiDocs",
          summary: "Open the interactive Swagger API documentation",
          responses: {
            "200": {
              description: "Swagger UI page",
              content: {
                "text/html": {
                  schema: { type: "string" },
                },
              },
            },
          },
        },
      },
      "/openapi.json": {
        get: {
          tags: ["system"],
          operationId: "getOpenApiJson",
          summary: "Get the current OpenAPI contract as JSON",
          responses: {
            "200": response("OpenAPI contract as JSON", {
              type: "object",
            }),
          },
        },
      },
      "/openapi.yaml": {
        get: {
          tags: ["system"],
          operationId: "getOpenApiYaml",
          summary: "Get the current OpenAPI contract",
          responses: {
            "200": {
              description: "OpenAPI contract as YAML",
              content: {
                "application/yaml": {
                  schema: { type: "string" },
                },
              },
            },
          },
        },
      },
      "/auth/me": {
        get: {
          tags: getCurrentUserRouteSchema.tags,
          operationId: "getCurrentUser",
          summary: getCurrentUserRouteSchema.summary,
          security: bearerAuth(),
          parameters: [
            {
              name: "activeGeography",
              in: "query",
              required: false,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": response(
              "Current authenticated user context",
              getCurrentUserRouteSchema.response[200],
            ),
            "401": response(
              "Authentication token is missing or invalid",
              authErrorResponseSchema,
            ),
            "403": response(
              "Active geography is outside user scope",
              authErrorResponseSchema,
            ),
            "500": response("Auth configuration is invalid", authErrorResponseSchema),
          },
        },
      },
      "/auth/geography-access": {
        get: {
          tags: getGeographyAccessRouteSchema.tags,
          operationId: "checkGeographyAccess",
          summary: getGeographyAccessRouteSchema.summary,
          security: bearerAuth(),
          parameters: [
            {
              name: "geography",
              in: "query",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": response(
              "Geography is inside the current user's scope",
              getGeographyAccessRouteSchema.response[200],
            ),
            "400": response("Geography query is missing", authErrorResponseSchema),
            "401": response(
              "Authentication token is missing or invalid",
              authErrorResponseSchema,
            ),
            "403": response(
              "Requested geography is outside user scope",
              authErrorResponseSchema,
            ),
            "500": response("Auth configuration is invalid", authErrorResponseSchema),
          },
        },
      },
      "/sources": {
        get: {
          tags: listSourcesRouteSchema.tags,
          operationId: "listSources",
          summary: listSourcesRouteSchema.summary,
          responses: {
            "200": response(
              "Configured source metadata",
              listSourcesRouteSchema.response[200],
            ),
          },
        },
      },
      "/sources/{sourceId}": {
        get: {
          tags: getSourceRouteSchema.tags,
          operationId: "getSource",
          summary: getSourceRouteSchema.summary,
          parameters: [
            pathParameter("sourceId", sourceIdParamsSchema.properties.sourceId),
          ],
          responses: {
            "200": response("Source metadata", getSourceRouteSchema.response[200]),
            "404": response("Source not found", getSourceRouteSchema.response[404]),
          },
        },
      },
      "/sources/{sourceId}/sync": {
        post: {
          tags: queueSourceSyncRouteSchema.tags,
          operationId: "queueSourceSync",
          summary: queueSourceSyncRouteSchema.summary,
          parameters: [
            pathParameter("sourceId", sourceIdParamsSchema.properties.sourceId),
          ],
          responses: {
            "202": response(
              "Sync has been queued",
              queueSourceSyncRouteSchema.response[202],
            ),
            "404": response(
              "Source not found",
              queueSourceSyncRouteSchema.response[404],
            ),
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        CurrentUserContext: currentUserContextSchema,
        GeographyAccessResponse: geographyAccessResponseSchema,
        SourceMetadata: sourceMetadataSchema,
        SourceSyncResult: sourceSyncResultSchema,
        ErrorResponse: errorResponseSchema,
      },
    },
  };
}

export function buildOpenApiYaml() {
  return `${toYaml(buildOpenApiDocument())}\n`;
}

export async function writeOpenApiYaml(
  outputPath = resolve(process.cwd(), "openapi.yaml"),
) {
  const { format } = await import("prettier");
  const formattedYaml = await format(buildOpenApiYaml(), { parser: "yaml" });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, formattedYaml, "utf8");
}

function response(description: string, schema: unknown) {
  return {
    description,
    content: {
      [jsonContentType]: {
        schema,
      },
    },
  };
}

function pathParameter(name: string, schema: unknown) {
  return {
    name,
    in: "path",
    required: true,
    schema,
  };
}

function bearerAuth() {
  return [{ bearerAuth: [] }];
}

function formatYamlScalar(value: unknown) {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (value === null) {
    return "null";
  }

  return String(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toYaml(value: unknown, indentLevel = 0): string {
  const indent = "  ".repeat(indentLevel);

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }

    return value
      .map((item) => {
        if (Array.isArray(item) && item.length === 0) {
          return `${indent}- []`;
        }

        if (isPlainObject(item) && Object.keys(item).length === 0) {
          return `${indent}- {}`;
        }

        if (isPlainObject(item) || Array.isArray(item)) {
          return `${indent}-\n${toYaml(item, indentLevel + 1)}`;
        }

        return `${indent}- ${formatYamlScalar(item)}`;
      })
      .join("\n");
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value);

    if (entries.length === 0) {
      return "{}";
    }

    return entries
      .map(([key, itemValue]) => {
        if (Array.isArray(itemValue) && itemValue.length === 0) {
          return `${indent}${key}: []`;
        }

        if (isPlainObject(itemValue) && Object.keys(itemValue).length === 0) {
          return `${indent}${key}: {}`;
        }

        if (isPlainObject(itemValue) || Array.isArray(itemValue)) {
          return `${indent}${key}:\n${toYaml(itemValue, indentLevel + 1)}`;
        }

        return `${indent}${key}: ${formatYamlScalar(itemValue)}`;
      })
      .join("\n");
  }

  return `${indent}${formatYamlScalar(value)}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await writeOpenApiYaml();
}
