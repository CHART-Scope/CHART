import type { FastifyInstance, FastifyReply } from "fastify";

import {
  AuthError,
  getCurrentUserContext as defaultGetCurrentUserContext,
} from "../auth/service.js";
import type { CurrentUserContext } from "../auth/types.js";
import { UserError } from "./errors.js";
import { createUserService, type UserService } from "./service.js";
import {
  createUserBodySchema,
  userErrorResponseSchema,
  userParamsSchema,
  userRecordSchema,
  type CreateUserInput,
} from "./types.js";

type GetCurrentUser = (input: {
  authorization?: string;
}) => Promise<CurrentUserContext>;

type UserParams = {
  userId: string;
};

export const listUsersRouteSchema = {
  tags: ["users"],
  operationId: "listUsers",
  summary: "List CHART users visible to a platform administrator",
  security: [{ bearerAuth: [] }],
  response: {
    200: {
      type: "array",
      items: userRecordSchema,
    },
    401: userErrorResponseSchema,
    403: userErrorResponseSchema,
  },
} as const;

export const createUserRouteSchema = {
  tags: ["users"],
  operationId: "createUser",
  summary: "Create or update one CHART identity user",
  security: [{ bearerAuth: [] }],
  body: createUserBodySchema,
  response: {
    200: userRecordSchema,
    400: userErrorResponseSchema,
    401: userErrorResponseSchema,
    403: userErrorResponseSchema,
    409: userErrorResponseSchema,
    502: userErrorResponseSchema,
  },
} as const;

export const disableUserRouteSchema = {
  tags: ["users"],
  operationId: "disableUser",
  summary: "Disable one CHART identity user",
  security: [{ bearerAuth: [] }],
  params: userParamsSchema,
  response: {
    200: userRecordSchema,
    400: userErrorResponseSchema,
    401: userErrorResponseSchema,
    403: userErrorResponseSchema,
    404: userErrorResponseSchema,
    502: userErrorResponseSchema,
  },
} as const;

export async function registerUserRoutes(
  app: FastifyInstance,
  options: {
    service?: UserService;
    getCurrentUser?: GetCurrentUser;
  } = {},
) {
  const service = options.service ?? createUserService();
  const getCurrentUser = options.getCurrentUser ?? defaultGetCurrentUserContext;

  app.get("", { schema: listUsersRouteSchema }, async (request, reply) => {
    try {
      const context = await getCurrentUser({
        authorization: request.headers.authorization,
      });

      return await service.listUsers(context);
    } catch (error) {
      return replyWithUserError(reply, error);
    }
  });

  app.post<{ Body: CreateUserInput }>(
    "",
    { schema: createUserRouteSchema },
    async (request, reply) => {
      try {
        const context = await getCurrentUser({
          authorization: request.headers.authorization,
        });

        return await service.createUser(request.body, context);
      } catch (error) {
        return replyWithUserError(reply, error);
      }
    },
  );

  app.post<{ Params: UserParams }>(
    "/:userId/disable",
    { schema: disableUserRouteSchema },
    async (request, reply) => {
      try {
        const context = await getCurrentUser({
          authorization: request.headers.authorization,
        });

        return await service.disableUser(request.params.userId, context);
      } catch (error) {
        return replyWithUserError(reply, error);
      }
    },
  );
}

function replyWithUserError(reply: FastifyReply, error: unknown) {
  if (isRouteError(error)) {
    reply.code(error.statusCode);
    return { error: error.code };
  }

  throw error;
}

function isRouteError(
  error: unknown,
): error is Pick<UserError | AuthError, "code" | "statusCode"> {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  );
}
