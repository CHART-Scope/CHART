import assert from "node:assert/strict";
import test from "node:test";

import Fastify from "fastify";

import type { CurrentUserContext } from "../auth/types.js";
import { registerWorkspaceRoutes } from "./routes.js";
import { WorkspaceError, type WorkspaceService } from "./service.js";

const currentUser: CurrentUserContext = {
  userId: "keycloak-u1",
  username: "u1-health-region",
  roles: ["health_planning_lead"],
  geographyScopes: ["/country-a/region-a"],
  activeGeographyId: "/country-a/region-a",
  geographyLevel: "geo_level_1",
};

const workspace = {
  id: "workspace-1",
  name: "Regional heat planning 2026",
  planningCycle: "2026",
  status: "active" as const,
  createdByUserId: "keycloak-u1",
  ownerUserId: "keycloak-u1",
  ownerGeographyId: "geo-country-a-region-a",
  memberRole: "owner" as const,
  hazardIds: ["hazard-extreme-heat"],
};

test("POST /workspaces creates a geography-scoped planning workspace", async () => {
  const app = Fastify();
  const service: WorkspaceService = {
    async createWorkspace(input, context) {
      assert.equal(context.userId, currentUser.userId);
      assert.deepEqual(input, {
        name: workspace.name,
        ownerGeographyId: "geo-country-a-region-a",
        planningCycle: "2026",
        hazardIds: ["hazard-extreme-heat"],
      });
      return workspace;
    },
    async getWorkspace() {
      return workspace;
    },
  };

  await app.register(registerWorkspaceRoutes, {
    prefix: "/workspaces",
    service,
    async getCurrentUser() {
      return currentUser;
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/workspaces",
    headers: {
      authorization: "Bearer token",
    },
    payload: {
      name: workspace.name,
      ownerGeographyId: "geo-country-a-region-a",
      planningCycle: "2026",
      hazardIds: ["hazard-extreme-heat"],
    },
  });

  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.json(), workspace);

  await app.close();
});

test("GET /workspaces/:workspaceId returns one workspace", async () => {
  const app = Fastify();
  const service: WorkspaceService = {
    async createWorkspace() {
      return workspace;
    },
    async getWorkspace(workspaceId, context) {
      assert.equal(workspaceId, "workspace-1");
      assert.equal(context.userId, currentUser.userId);
      return workspace;
    },
  };

  await app.register(registerWorkspaceRoutes, {
    prefix: "/workspaces",
    service,
    async getCurrentUser() {
      return currentUser;
    },
  });

  const response = await app.inject({
    method: "GET",
    url: "/workspaces/workspace-1",
    headers: {
      authorization: "Bearer token",
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), workspace);

  await app.close();
});

test("GET /workspaces/:workspaceId maps workspace access errors", async () => {
  const app = Fastify();
  const service: WorkspaceService = {
    async createWorkspace() {
      return workspace;
    },
    async getWorkspace() {
      throw new WorkspaceError("WORKSPACE_ACCESS_DENIED", 403);
    },
  };

  await app.register(registerWorkspaceRoutes, {
    prefix: "/workspaces",
    service,
    async getCurrentUser() {
      return currentUser;
    },
  });

  const response = await app.inject({
    method: "GET",
    url: "/workspaces/workspace-1",
    headers: {
      authorization: "Bearer token",
    },
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), { error: "WORKSPACE_ACCESS_DENIED" });

  await app.close();
});
