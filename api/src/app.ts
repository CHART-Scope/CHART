import Fastify from "fastify";
import fastifySwagger from "@fastify/swagger";

import { buildApiDocsHtml } from "./apiDocs.js";
import { registerAuthRoutes } from "./modules/auth/routes.js";
import { registerDataIngestionRoutes } from "./modules/data-ingestion/routes.js";
import { registerGeographyRoutes } from "./modules/geographies/routes.js";
import { registerSetupRoutes } from "./modules/setup/routes.js";
import { registerSolutionRepositoryRoutes } from "./modules/solution-repository/routes.js";
import { registerUserRoutes } from "./modules/users/routes.js";
import { registerWorkspaceRoutes } from "./modules/workspaces/routes.js";

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

  app.register(fastifySwagger, {
    openapi: {
      info: {
        title: "CHART API",
        version: "0.1.0",
        description: "Current contract for CHART backend modules.",
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
    },
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
      return reply.code(204).send();
    }
  });

  app.get(
    "/health",
    {
      schema: {
        tags: ["system"],
        operationId: "getHealth",
        summary: "Check API health",
        response: {
          200: {
            type: "object",
            required: ["status"],
            properties: {
              status: { type: "string" },
            },
          },
        },
      },
    },
    async () => {
      return { status: "ok" };
    },
  );

  app.get("/api", { schema: { hide: true } }, async (_request, reply) => {
    reply.type("text/html");
    return buildApiDocsHtml();
  });

  app.get("/api/", { schema: { hide: true } }, async (_request, reply) => {
    reply.type("text/html");
    return buildApiDocsHtml();
  });

  app.get("/openapi.json", { schema: { hide: true } }, async (_request, reply) => {
    reply.type("application/json");
    return app.swagger();
  });

  app.get("/openapi.yaml", { schema: { hide: true } }, async (_request, reply) => {
    reply.type("application/yaml");
    return app.swagger({ yaml: true });
  });

  app.register(registerAuthRoutes, { prefix: "/auth" });
  app.register(registerDataIngestionRoutes, { prefix: "/sources" });
  app.register(registerGeographyRoutes, { prefix: "/geographies" });
  app.register(registerSetupRoutes, { prefix: "/setup" });
  app.register(registerSolutionRepositoryRoutes, { prefix: "/solutions" });
  app.register(registerUserRoutes, { prefix: "/users" });
  app.register(registerWorkspaceRoutes, { prefix: "/workspaces" });

  return app;
}
