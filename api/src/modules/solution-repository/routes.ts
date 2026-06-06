import type { FastifyInstance, FastifyReply } from "fastify";

import {
  createSolutionRepositoryService,
  SolutionRepositoryError,
  type SolutionRepositoryService,
} from "./service.js";
import {
  solutionRepositoryErrorResponseSchema,
  solutionRepositoryItemSchema,
  solutionRepositoryListResponseSchema,
  solutionRepositoryParamsSchema,
  solutionRepositoryQuerySchema,
  solutionRepositoryTaxonomySchema,
  type SolutionRepositoryQuery,
} from "./types.js";

type SolutionParams = {
  slug: string;
};

export const listSolutionsRouteSchema = {
  tags: ["solution-repository"],
  operationId: "listSolutions",
  summary: "List climate-health adaptation solutions",
  querystring: solutionRepositoryQuerySchema,
  response: {
    200: solutionRepositoryListResponseSchema,
  },
} as const;

export const getSolutionRouteSchema = {
  tags: ["solution-repository"],
  operationId: "getSolution",
  summary: "Get one climate-health adaptation solution",
  params: solutionRepositoryParamsSchema,
  response: {
    200: solutionRepositoryItemSchema,
    404: solutionRepositoryErrorResponseSchema,
  },
} as const;

export const listSolutionTaxonomiesRouteSchema = {
  tags: ["solution-repository"],
  operationId: "listSolutionTaxonomies",
  summary: "List solution repository taxonomy values",
  response: {
    200: {
      type: "array",
      items: solutionRepositoryTaxonomySchema,
    },
  },
} as const;

export async function registerSolutionRepositoryRoutes(
  app: FastifyInstance,
  options: { service?: SolutionRepositoryService } = {},
) {
  const service = options.service ?? createSolutionRepositoryService();

  app.get<{ Querystring: SolutionRepositoryQuery }>(
    "",
    { schema: listSolutionsRouteSchema },
    async (request) => {
      return service.listSolutions(request.query);
    },
  );

  app.get("/taxonomies", { schema: listSolutionTaxonomiesRouteSchema }, async () => {
    return service.listTaxonomies();
  });

  app.get<{ Params: SolutionParams }>(
    "/:slug",
    { schema: getSolutionRouteSchema },
    async (request, reply) => {
      try {
        return await service.getSolutionBySlug(request.params.slug);
      } catch (error) {
        return replyWithSolutionRepositoryError(reply, error);
      }
    },
  );
}

function replyWithSolutionRepositoryError(reply: FastifyReply, error: unknown) {
  if (error instanceof SolutionRepositoryError) {
    reply.code(error.statusCode);
    return { error: error.code };
  }

  throw error;
}
