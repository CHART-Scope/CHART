import type { FastifyInstance } from "fastify";

import {
  getDhis2PublicConfig,
  getSourceById,
  listSources,
  queueSourceSync,
  testDhis2Connection,
} from "./service.js";
import {
  dhis2ConnectionTestResultSchema,
  dhis2PublicConfigSchema,
  errorResponseSchema,
  sourceIdParamsSchema,
  sourceMetadataSchema,
  sourceSyncResultSchema,
} from "./types.js";

export const listSourcesRouteSchema = {
  tags: ["data-ingestion"],
  operationId: "listSources",
  summary: "List configured data sources",
  response: {
    200: {
      type: "array",
      items: sourceMetadataSchema,
    },
  },
} as const;

export const getSourceRouteSchema = {
  tags: ["data-ingestion"],
  operationId: "getSource",
  summary: "Get one configured data source",
  params: sourceIdParamsSchema,
  response: {
    200: sourceMetadataSchema,
    404: errorResponseSchema,
  },
} as const;

export const queueSourceSyncRouteSchema = {
  tags: ["data-ingestion"],
  operationId: "queueSourceSync",
  summary: "Queue a data source sync",
  params: sourceIdParamsSchema,
  response: {
    202: sourceSyncResultSchema,
    404: errorResponseSchema,
  },
} as const;

export const getDhis2ConfigRouteSchema = {
  tags: ["data-ingestion"],
  summary: "Get masked DHIS2 source configuration",
  response: {
    200: dhis2PublicConfigSchema,
  },
} as const;

export const testDhis2ConnectionRouteSchema = {
  tags: ["data-ingestion"],
  summary: "Test configured DHIS2 credentials",
  response: {
    200: dhis2ConnectionTestResultSchema,
  },
} as const;

export async function registerDataIngestionRoutes(app: FastifyInstance) {
  app.get("", { schema: listSourcesRouteSchema }, async () => {
    return listSources();
  });

  app.get("/dhis2/config", { schema: getDhis2ConfigRouteSchema }, async () => {
    return getDhis2PublicConfig();
  });

  app.post(
    "/dhis2/test-connection",
    { schema: testDhis2ConnectionRouteSchema },
    async () => {
      return testDhis2Connection();
    },
  );

  app.get<{ Params: { sourceId: string } }>(
    "/:sourceId",
    { schema: getSourceRouteSchema },
    async (request, reply) => {
      const params = request.params;
      const source = getSourceById(params.sourceId);

      if (!source) {
        reply.code(404);
        return { error: "SOURCE_NOT_FOUND" };
      }

      return source;
    },
  );

  app.post<{ Params: { sourceId: string } }>(
    "/:sourceId/sync",
    { schema: queueSourceSyncRouteSchema },
    async (request, reply) => {
      const params = request.params;
      const source = getSourceById(params.sourceId);

      if (!source) {
        reply.code(404);
        return { error: "SOURCE_NOT_FOUND" };
      }

      reply.code(202);
      return queueSourceSync(params.sourceId);
    },
  );
}
