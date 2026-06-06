import type { FastifyInstance } from "fastify";

import { getSourceById, listSources, queueSourceSync } from "./service.js";
import {
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

export async function registerDataIngestionRoutes(app: FastifyInstance) {
  app.get("", { schema: listSourcesRouteSchema }, async () => {
    return listSources();
  });

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
