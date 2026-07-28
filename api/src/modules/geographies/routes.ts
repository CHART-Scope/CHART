import type { FastifyInstance, FastifyReply } from "fastify";

import {
  createGeographyService,
  GeographyError,
  type GeographyService,
} from "./service.js";
import {
  geographyErrorResponseSchema,
  geographyRecordSchema,
  type ListGeographiesQuery,
  type ResolveGeographyQuery,
} from "./types.js";

export const listGeographiesRouteSchema = {
  tags: ["geographies"],
  operationId: "listGeographies",
  summary: "List configured geography records",
  querystring: {
    type: "object",
    properties: {
      countryCode: { type: "string" },
      parentId: { type: "string" },
    },
  },
  response: {
    200: {
      type: "array",
      items: geographyRecordSchema,
    },
  },
} as const;

export const resolveGeographyRouteSchema = {
  tags: ["geographies"],
  operationId: "resolveGeography",
  summary: "Resolve one geography by app id or path",
  querystring: {
    type: "object",
    properties: {
      id: { type: "string" },
      path: { type: "string" },
    },
  },
  response: {
    200: geographyRecordSchema,
    400: geographyErrorResponseSchema,
    404: geographyErrorResponseSchema,
  },
} as const;

export async function registerGeographyRoutes(
  app: FastifyInstance,
  options: { service?: GeographyService } = {},
) {
  const service = options.service ?? createGeographyService();

  app.get<{ Querystring: ListGeographiesQuery }>(
    "",
    { schema: listGeographiesRouteSchema },
    async (request) => {
      return service.listGeographies(request.query);
    },
  );

  app.get<{ Querystring: ResolveGeographyQuery }>(
    "/resolve",
    { schema: resolveGeographyRouteSchema },
    async (request, reply) => {
      try {
        return await service.resolveGeography(request.query);
      } catch (error) {
        return replyWithGeographyError(reply, error);
      }
    },
  );
}

function replyWithGeographyError(reply: FastifyReply, error: unknown) {
  if (error instanceof GeographyError) {
    reply.code(error.statusCode);
    return { error: error.code };
  }

  throw error;
}
