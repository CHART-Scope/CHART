import type { FastifyInstance, FastifyReply } from "fastify";

import {
  AuthError,
  getCurrentUserContext as defaultGetCurrentUserContext,
} from "../auth/service.js";
import type { CurrentUserContext } from "../auth/types.js";
import { SetupError } from "./errors.js";
import { createSetupService, type SetupService } from "./service.js";
import {
  bootstrapSetupBodySchema,
  bootstrapSetupResultSchema,
  completeSetupBodySchema,
  setupErrorResponseSchema,
  setupOptionsSchema,
  setupStatusSchema,
  type BootstrapSetupInput,
  type CompleteSetupInput,
} from "./types.js";

type GetCurrentUser = (input: {
  authorization?: string;
}) => Promise<CurrentUserContext>;

export const getSetupStatusRouteSchema = {
  tags: ["setup"],
  operationId: "getSetupStatus",
  summary: "Check whether CHART onboarding is required",
  response: {
    200: setupStatusSchema,
  },
} as const;

export const getSetupOptionsRouteSchema = {
  tags: ["setup"],
  operationId: "getSetupOptions",
  summary: "Get setup choices needed before CHART onboarding is completed",
  response: {
    200: setupOptionsSchema,
  },
} as const;

export const completeSetupRouteSchema = {
  tags: ["setup"],
  operationId: "completeSetup",
  summary: "Complete the required CHART onboarding setup",
  security: [{ bearerAuth: [] }],
  body: completeSetupBodySchema,
  response: {
    200: setupStatusSchema,
    400: setupErrorResponseSchema,
    401: setupErrorResponseSchema,
    403: setupErrorResponseSchema,
  },
} as const;

export const bootstrapSetupRouteSchema = {
  tags: ["setup"],
  operationId: "bootstrapSetup",
  summary: "Create the first CHART administrator and complete initial onboarding",
  body: bootstrapSetupBodySchema,
  response: {
    200: bootstrapSetupResultSchema,
    400: setupErrorResponseSchema,
    409: setupErrorResponseSchema,
    502: setupErrorResponseSchema,
  },
} as const;

export const resetSetupRouteSchema = {
  tags: ["setup"],
  operationId: "resetSetup",
  summary: "Clear CHART setup-owned workspace state and require onboarding again",
  security: [{ bearerAuth: [] }],
  response: {
    200: setupStatusSchema,
    401: setupErrorResponseSchema,
    403: setupErrorResponseSchema,
  },
} as const;

export async function registerSetupRoutes(
  app: FastifyInstance,
  options: {
    service?: SetupService;
    getCurrentUser?: GetCurrentUser;
  } = {},
) {
  const service = options.service ?? createSetupService();
  const getCurrentUser = options.getCurrentUser ?? defaultGetCurrentUserContext;

  app.get("", { schema: getSetupStatusRouteSchema }, async () => {
    return service.getStatus();
  });

  app.get("/options", { schema: getSetupOptionsRouteSchema }, async () => {
    return service.getOptions();
  });

  app.post<{ Body: BootstrapSetupInput }>(
    "/bootstrap",
    { schema: bootstrapSetupRouteSchema },
    async (request, reply) => {
      try {
        return await service.bootstrapSetup(request.body);
      } catch (error) {
        return replyWithSetupError(reply, error);
      }
    },
  );

  app.post<{ Body: CompleteSetupInput }>(
    "/complete",
    { schema: completeSetupRouteSchema },
    async (request, reply) => {
      try {
        const context = await getCurrentUser({
          authorization: request.headers.authorization,
        });

        return await service.completeSetup(request.body, context);
      } catch (error) {
        return replyWithSetupError(reply, error);
      }
    },
  );

  app.post("/reset", { schema: resetSetupRouteSchema }, async (request, reply) => {
    try {
      const context = await getCurrentUser({
        authorization: request.headers.authorization,
      });

      return await service.resetSetup(context);
    } catch (error) {
      return replyWithSetupError(reply, error);
    }
  });
}

function replyWithSetupError(reply: FastifyReply, error: unknown) {
  if (error instanceof SetupError || error instanceof AuthError) {
    reply.code(error.statusCode);
    return { error: error.code };
  }

  throw error;
}
