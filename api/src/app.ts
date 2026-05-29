import Fastify from "fastify";

import { registerAuthRoutes } from "./modules/auth/routes.js";
import { registerDataIngestionRoutes } from "./modules/data-ingestion/routes.js";
import { buildOpenApiYaml } from "./openapi.js";

const allowedCorsOrigins = new Set(
  (process.env.CHART_CORS_ORIGINS ?? "http://127.0.0.1:3100,http://localhost:3100")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

export function buildApp() {
  const app = Fastify({
    logger: true,
  });

  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;

    if (origin && allowedCorsOrigins.has(origin)) {
      reply.header("Access-Control-Allow-Origin", origin);
      reply.header("Access-Control-Allow-Credentials", "true");
      reply.header("Vary", "Origin");
    }

    if (request.method === "OPTIONS") {
      reply.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      reply.header(
        "Access-Control-Allow-Headers",
        "Authorization,Content-Type,X-Chart-Active-Geography",
      );
      reply.code(204).send();
    }
  });

  app.get("/health", async () => {
    return { status: "ok" };
  });

  app.get("/openapi.yaml", async (_request, reply) => {
    reply.type("application/yaml");
    return buildOpenApiYaml();
  });

  app.register(registerAuthRoutes, { prefix: "/auth" });
  app.register(registerDataIngestionRoutes, { prefix: "/sources" });

  return app;
}
