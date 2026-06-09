import { NextResponse } from "next/server";

export const dynamic = "force-static";

type RouteContext = {
  params: Promise<{
    spec: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { spec } = await context.params;

  if (spec !== "openapi.json") {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({
    openapi: "3.0.3",
    info: {
      title: "CHART Repository Public API",
      version: "0.1.0",
      description: "Unauthenticated public read API for CHART repository content.",
    },
    paths: {
      "/api/public/hazards": {
        get: {
          tags: ["chart-repository"],
          operationId: "listHazards",
          summary:
            "List editable hazards with linked health implications and solution counts",
          responses: {
            "200": {
              description: "Hazard list",
            },
          },
        },
      },
      "/api/public/hazards/{hazardId}": {
        get: {
          tags: ["chart-repository"],
          operationId: "getHazard",
          summary: "Get one hazard and its linked solutions",
          parameters: [
            {
              name: "hazardId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Hazard detail",
            },
            "404": {
              description: "Hazard not found",
            },
          },
        },
      },
      "/api/public/health-implications": {
        get: {
          tags: ["chart-repository"],
          operationId: "listHealthImplications",
          summary: "List editable health implications and linked hazards",
          responses: {
            "200": {
              description: "Health implication list",
            },
          },
        },
      },
      "/api/public/solutions": {
        get: {
          tags: ["chart-repository"],
          operationId: "listSolutions",
          summary: "List published repository solutions",
          parameters: [
            { name: "hazard", in: "query", schema: { type: "string" } },
            { name: "solutionType", in: "query", schema: { type: "string" } },
            { name: "cost", in: "query", schema: { type: "string" } },
            { name: "search", in: "query", schema: { type: "string" } },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 100 },
            },
          ],
          responses: {
            "200": {
              description: "Solution list",
            },
          },
        },
      },
      "/api/public/solutions/{slug}": {
        get: {
          tags: ["chart-repository"],
          operationId: "getSolution",
          summary: "Get one published repository solution",
          parameters: [
            {
              name: "slug",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Solution detail",
            },
            "404": {
              description: "Solution not found",
            },
          },
        },
      },
      "/api/public/solutions/taxonomies": {
        get: {
          tags: ["chart-repository"],
          operationId: "listSolutionTaxonomies",
          summary: "List taxonomy values used by published solutions",
          responses: {
            "200": {
              description: "Taxonomy list",
            },
          },
        },
      },
    },
  });
}
