import assert from "node:assert/strict";
import test from "node:test";

import { createChartRepositorySolutionService } from "./service.js";

test("repository service reads solutions from the public CHART repository API", async () => {
  const requestedUrls: string[] = [];
  const service = createChartRepositorySolutionService({
    env: {
      CHART_REPOSITORY_URL: "http://repository.test",
    },
    async fetch(input) {
      requestedUrls.push(String(input));

      if (String(input).endsWith("/api/public/solutions/taxonomies")) {
        return jsonResponse([
          { id: "hazard-extreme-heat", type: "hazard", label: "Extreme heat" },
          {
            id: "solution-type-service-delivery",
            type: "solution_type",
            label: "Service delivery",
          },
        ]);
      }

      return jsonResponse({
        items: [
          {
            id: "solution-cooling-centre",
            slug: "cooling-centre",
            name: "Cooling centre",
            summary: "A public cooling centre for extreme heat.",
            description: "Open a public cooling centre during extreme heat events.",
            implementationNotes: null,
            costOfImplementation: "low",
            maintenanceRequirement: null,
            timeToImplement: null,
            evidenceLevel: null,
            sourceId: "chart-repository",
            sourceRecordId: "12",
            sourceVersion: "2026-06-09T13:50:38.316Z",
            sourceUpdatedAt: "2026-06-09T13:50:38.316Z",
            license: null,
            attribution: null,
            status: "published",
            taxonomies: [
              { id: "hazard-extreme-heat", type: "hazard", label: "Extreme heat" },
              {
                id: "solution-type-service-delivery",
                type: "solution_type",
                label: "Service delivery",
              },
            ],
            links: [{ label: "Reference", url: "https://example.org/reference" }],
            assets: [
              {
                id: "solution-asset-cooling-centre-image",
                kind: "image",
                filename: "cooling-centre.png",
                mimeType: "image/png",
                sizeBytes: 2048,
                storageUrl: "http://repository.test/api/media/file/cooling-centre.png",
                attribution: null,
              },
            ],
          },
        ],
        total: 1,
      });
    },
  });

  const response = await service.listSolutions();

  assert.deepEqual(requestedUrls.sort(), [
    "http://repository.test/api/public/solutions/taxonomies",
    "http://repository.test/api/public/solutions?limit=100&status=published",
  ]);
  assert.equal(response.total, 1);
  assert.equal(response.items[0].slug, "cooling-centre");
  assert.deepEqual(response.items[0].taxonomies, [
    { id: "hazard-extreme-heat", type: "hazard", label: "Extreme heat" },
    {
      id: "solution-type-service-delivery",
      type: "solution_type",
      label: "Service delivery",
    },
  ]);
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
