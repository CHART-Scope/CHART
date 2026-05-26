import Fastify from "fastify";

import { registerAuthRoutes } from "./modules/auth/routes.js";
import { registerDataIngestionRoutes } from "./modules/data-ingestion/routes.js";

export function buildApp() {
  const app = Fastify({
    logger: true,
  });

  app.get("/health", async () => {
    return { status: "ok" };
  });

  app.register(registerAuthRoutes, { prefix: "/auth" });
  app.register(registerDataIngestionRoutes, { prefix: "/sources" });

  return app;
}
