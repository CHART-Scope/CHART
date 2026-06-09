import type { FastifyInstance, FastifyReply } from "fastify";

import {
  createChartRepositoryHazardService,
  ChartRepositoryHazardError,
  type ChartRepositoryHazardService,
} from "../../services/chart-repository/service.js";
import {
  chartRepositoryHazardDetailResponseSchema,
  chartRepositoryHazardErrorResponseSchema,
  chartRepositoryHazardListResponseSchema,
  chartRepositoryHazardParamsSchema,
} from "../../services/chart-repository/types.js";

type HazardParams = {
  hazardId: string;
};

export const listHazardsRouteSchema = {
  tags: ["chart-repository"],
  operationId: "listHazards",
  summary: "List CHART repository hazards",
  response: {
    200: chartRepositoryHazardListResponseSchema,
  },
} as const;

export const getHazardDetailRouteSchema = {
  tags: ["chart-repository"],
  operationId: "getHazardDetail",
  summary: "Get CHART repository hazard detail",
  params: chartRepositoryHazardParamsSchema,
  response: {
    200: chartRepositoryHazardDetailResponseSchema,
    404: chartRepositoryHazardErrorResponseSchema,
  },
} as const;

export async function registerHazardRoutes(
  app: FastifyInstance,
  options: { service?: ChartRepositoryHazardService } = {},
) {
  const service = options.service ?? createChartRepositoryHazardService();

  app.get("", { schema: listHazardsRouteSchema }, async () => {
    return service.listHazards();
  });

  app.get<{ Params: HazardParams }>(
    "/:hazardId",
    { schema: getHazardDetailRouteSchema },
    async (request, reply) => {
      try {
        return await service.getHazardDetail(request.params.hazardId);
      } catch (error) {
        return replyWithChartRepositoryHazardError(reply, error);
      }
    },
  );
}

function replyWithChartRepositoryHazardError(reply: FastifyReply, error: unknown) {
  if (error instanceof ChartRepositoryHazardError) {
    reply.code(error.statusCode);
    return { error: error.code };
  }

  throw error;
}
