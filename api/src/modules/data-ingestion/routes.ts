import type { FastifyInstance } from "fastify";

import { getSourceById, listSources, queueSourceSync } from "./service.js";

export async function registerDataIngestionRoutes(app: FastifyInstance) {
  app.get("/", async () => {
    return listSources();
  });

  app.get("/:sourceId", async (request, reply) => {
    const params = request.params as { sourceId: string };
    const source = getSourceById(params.sourceId);

    if (!source) {
      reply.code(404);
      return { error: "SOURCE_NOT_FOUND" };
    }

    return source;
  });

  app.post("/:sourceId/sync", async (request, reply) => {
    const params = request.params as { sourceId: string };
    const source = getSourceById(params.sourceId);

    if (!source) {
      reply.code(404);
      return { error: "SOURCE_NOT_FOUND" };
    }

    reply.code(202);
    return queueSourceSync(params.sourceId);
  });
}
