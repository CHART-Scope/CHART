import type { FastifyInstance } from "fastify";

import { getCurrentUser } from "./service.js";

export async function registerAuthRoutes(app: FastifyInstance) {
  app.get("/me", async () => {
    return getCurrentUser();
  });
}
