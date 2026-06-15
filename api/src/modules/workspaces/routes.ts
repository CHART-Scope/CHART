import type { FastifyInstance, FastifyReply } from "fastify";

import {
  AuthError,
  getCurrentUserContext as defaultGetCurrentUserContext,
} from "../auth/service.js";
import type { CurrentUserContext } from "../auth/types.js";
import {
  createWorkspaceService,
  WorkspaceError,
  type WorkspaceService,
} from "./service.js";
import {
  createWorkspaceBodySchema,
  workspaceErrorResponseSchema,
  workspaceParamsSchema,
  workspaceRecordSchema,
  type CreateWorkspaceInput,
} from "./types.js";

type WorkspaceParams = {
  workspaceId: string;
};

type GetCurrentUser = (input: {
  authorization?: string;
  activeGeographyId?: string;
}) => Promise<CurrentUserContext>;

export const createWorkspaceRouteSchema = {
  tags: ["workspaces"],
  operationId: "createWorkspace",
  summary: "Create a planning workspace for a geography",
  security: [{ bearerAuth: [] }],
  body: createWorkspaceBodySchema,
  response: {
    201: workspaceRecordSchema,
    400: workspaceErrorResponseSchema,
    401: workspaceErrorResponseSchema,
    403: workspaceErrorResponseSchema,
  },
} as const;

export const getWorkspaceRouteSchema = {
  tags: ["workspaces"],
  operationId: "getWorkspace",
  summary: "Get one planning workspace",
  security: [{ bearerAuth: [] }],
  params: workspaceParamsSchema,
  response: {
    200: workspaceRecordSchema,
    401: workspaceErrorResponseSchema,
    403: workspaceErrorResponseSchema,
    404: workspaceErrorResponseSchema,
  },
} as const;

export async function registerWorkspaceRoutes(
  app: FastifyInstance,
  options: {
    service?: WorkspaceService;
    getCurrentUser?: GetCurrentUser;
  } = {},
) {
  const service = options.service ?? createWorkspaceService();
  const getCurrentUser = options.getCurrentUser ?? defaultGetCurrentUserContext;

  app.post<{ Body: CreateWorkspaceInput }>(
    "",
    { schema: createWorkspaceRouteSchema },
    async (request, reply) => {
      try {
        const context = await getCurrentUser({
          authorization: request.headers.authorization,
        });
        const workspace = await service.createWorkspace(request.body, context);

        reply.code(201);
        return workspace;
      } catch (error) {
        return replyWithWorkspaceError(reply, error);
      }
    },
  );

  app.get<{ Params: WorkspaceParams }>(
    "/:workspaceId",
    { schema: getWorkspaceRouteSchema },
    async (request, reply) => {
      try {
        const context = await getCurrentUser({
          authorization: request.headers.authorization,
        });

        return await service.getWorkspace(request.params.workspaceId, context);
      } catch (error) {
        return replyWithWorkspaceError(reply, error);
      }
    },
  );
}

function replyWithWorkspaceError(reply: FastifyReply, error: unknown) {
  if (error instanceof WorkspaceError || error instanceof AuthError) {
    reply.code(error.statusCode);
    return { error: error.code };
  }

  throw error;
}
