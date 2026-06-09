import type { FastifyInstance, FastifyReply } from "fastify";

import {
  createChartRepositorySolutionService,
  ChartRepositorySolutionError,
  type ChartRepositorySolutionService,
} from "../../services/chart-repository/service.js";
import {
  chartRepositorySolutionErrorResponseSchema,
  chartRepositorySolutionItemSchema,
  chartRepositorySolutionListResponseSchema,
  chartRepositorySolutionParamsSchema,
  chartRepositorySolutionQuerySchema,
  chartRepositorySolutionTaxonomySchema,
  type ChartRepositorySolutionQuery,
} from "../../services/chart-repository/types.js";

type SolutionParams = {
  slug: string;
};

export const listSolutionsRouteSchema = {
  tags: ["chart-repository"],
  operationId: "listSolutions",
  summary: "List CHART repository solutions",
  querystring: chartRepositorySolutionQuerySchema,
  response: {
    200: chartRepositorySolutionListResponseSchema,
  },
} as const;

export const getSolutionRouteSchema = {
  tags: ["chart-repository"],
  operationId: "getSolution",
  summary: "Get one CHART repository solution",
  params: chartRepositorySolutionParamsSchema,
  response: {
    200: chartRepositorySolutionItemSchema,
    404: chartRepositorySolutionErrorResponseSchema,
  },
} as const;

export const listSolutionTaxonomiesRouteSchema = {
  tags: ["chart-repository"],
  operationId: "listSolutionTaxonomies",
  summary: "List CHART repository solution taxonomy values",
  response: {
    200: {
      type: "array",
      items: chartRepositorySolutionTaxonomySchema,
    },
  },
} as const;

export async function registerSolutionRoutes(
  app: FastifyInstance,
  options: { service?: ChartRepositorySolutionService } = {},
) {
  const service = options.service ?? createChartRepositorySolutionService();

  app.get<{ Querystring: ChartRepositorySolutionQuery }>(
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
        return replyWithChartRepositorySolutionError(reply, error);
      }
    },
  );
}

function replyWithChartRepositorySolutionError(reply: FastifyReply, error: unknown) {
  if (error instanceof ChartRepositorySolutionError) {
    reply.code(error.statusCode);
    return { error: error.code };
  }

  throw error;
}
