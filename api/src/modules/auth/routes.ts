import type { FastifyInstance, FastifyReply } from "fastify";

import {
  AuthError,
  getCurrentUserContext,
  getGeographyAccessResult,
} from "./service.js";
import {
  authErrorResponseSchema,
  currentUserContextSchema,
  geographyAccessResponseSchema,
} from "./types.js";

type AuthQuery = {
  activeGeography?: string;
  geography?: string;
};

export const getCurrentUserRouteSchema = {
  tags: ["auth"],
  operationId: "getCurrentUser",
  summary: "Resolve the current user role and geography context",
  security: [{ bearerAuth: [] }],
  querystring: {
    type: "object",
    properties: {
      activeGeography: { type: "string" },
    },
  },
  response: {
    200: currentUserContextSchema,
    401: authErrorResponseSchema,
    403: authErrorResponseSchema,
    500: authErrorResponseSchema,
  },
} as const;

export const getGeographyAccessRouteSchema = {
  tags: ["auth"],
  operationId: "checkGeographyAccess",
  summary: "Check whether the current user can read a geography path",
  security: [{ bearerAuth: [] }],
  querystring: {
    type: "object",
    required: ["geography"],
    properties: {
      geography: { type: "string" },
    },
  },
  response: {
    200: geographyAccessResponseSchema,
    400: authErrorResponseSchema,
    401: authErrorResponseSchema,
    403: authErrorResponseSchema,
    500: authErrorResponseSchema,
  },
} as const;

export async function registerAuthRoutes(app: FastifyInstance) {
  app.get<{ Querystring: AuthQuery }>(
    "/me",
    { schema: getCurrentUserRouteSchema },
    async (request, reply) => {
      try {
        return await getCurrentUserContext({
          authorization: request.headers.authorization,
          activeGeographyId:
            request.query.activeGeography ?? readActiveGeographyHeader(request),
        });
      } catch (error) {
        return replyWithAuthError(reply, error);
      }
    },
  );

  app.get<{ Querystring: AuthQuery }>(
    "/geography-access",
    { schema: getGeographyAccessRouteSchema },
    async (request, reply) => {
      try {
        return await getGeographyAccessResult(request.query.geography, {
          authorization: request.headers.authorization,
        });
      } catch (error) {
        return replyWithAuthError(reply, error);
      }
    },
  );
}

function readActiveGeographyHeader(request: { headers: Record<string, unknown> }) {
  const header = request.headers["x-chart-active-geography"];

  return typeof header === "string" ? header : undefined;
}

function replyWithAuthError(reply: FastifyReply, error: unknown) {
  if (error instanceof AuthError) {
    reply.code(error.statusCode);
    return { error: error.code };
  }

  throw error;
}
