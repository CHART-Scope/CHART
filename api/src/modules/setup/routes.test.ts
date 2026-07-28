import assert from "node:assert/strict";
import test from "node:test";

import Fastify from "fastify";

import type { CurrentUserContext } from "../auth/types.js";
import { SetupError } from "./errors.js";
import { registerSetupRoutes } from "./routes.js";
import type { SetupService } from "./service.js";
import type { CompleteSetupInput, SetupStatus } from "./types.js";

const currentUser: CurrentUserContext = {
  userId: "keycloak-admin",
  username: "chart-admin",
  email: "chart-admin@example.org",
  roles: ["chart_admin", "content_editor"],
  geographyScopes: ["/country-a"],
  activeGeographyId: "/country-a",
  geographyLevel: "country",
};

const setupStatus: SetupStatus = {
  completed: false,
  requiresOnboarding: true,
  selectedHazards: [],
  counts: {
    geographies: 0,
    workspaceMembers: 0,
  },
};

test("GET /setup returns whether onboarding is required", async () => {
  const app = Fastify();
  const service = createSetupServiceStub();

  await app.register(registerSetupRoutes, { prefix: "/setup", service });

  const response = await app.inject({
    method: "GET",
    url: "/setup",
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), setupStatus);

  await app.close();
});

test("GET /setup/options returns onboarding choices", async () => {
  const app = Fastify();
  const service = createSetupServiceStub();

  await app.register(registerSetupRoutes, { prefix: "/setup", service });

  const response = await app.inject({
    method: "GET",
    url: "/setup/options",
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    hazards: [{ id: "hazard-extreme-heat", label: "Extreme heat" }],
  });

  await app.close();
});

test("POST /setup/complete completes onboarding for the signed-in admin", async () => {
  const app = Fastify();
  const service: SetupService = {
    async getStatus() {
      return setupStatus;
    },
    async getOptions() {
      return {
        hazards: [{ id: "hazard-extreme-heat", label: "Extreme heat" }],
      };
    },
    async bootstrapSetup() {
      return {
        setup: setupStatus,
        admin: {
          userId: "keycloak-admin",
          username: "chart-admin",
          email: "chart-admin@example.org",
        },
      };
    },
    async completeSetup(input, context) {
      assert.equal(context.userId, currentUser.userId);
      assert.deepEqual(input, {
        countryCode: "GB",
        countryName: "United Kingdom",
        geographies: [
          {
            id: "geo-gb-england-london",
            level: "geo_level_2",
            levelLabel: "district",
            name: "London",
            parentId: "geo-gb-england",
            path: "/united-kingdom/england/london",
            sortOrder: 10,
          },
        ],
        geographyLevelLabel: "county",
        hazardIds: ["hazard-extreme-heat"],
      } satisfies CompleteSetupInput);

      return {
        ...setupStatus,
        completed: true,
        requiresOnboarding: false,
        countryCode: "GB",
        countryName: "United Kingdom",
        rootGeographyId: "geo-gb",
        firstAdminUserId: currentUser.userId,
        selectedHazards: [{ id: "hazard-extreme-heat", label: "Extreme heat" }],
        counts: {
          geographies: 1,
          workspaceMembers: 1,
        },
      };
    },
    async resetSetup() {
      return setupStatus;
    },
  };

  await app.register(registerSetupRoutes, {
    prefix: "/setup",
    service,
    async getCurrentUser() {
      return currentUser;
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/setup/complete",
    headers: {
      authorization: "Bearer token",
    },
    payload: {
      countryCode: "GB",
      countryName: "United Kingdom",
      geographies: [
        {
          id: "geo-gb-england-london",
          level: "geo_level_2",
          levelLabel: "district",
          name: "London",
          parentId: "geo-gb-england",
          path: "/united-kingdom/england/london",
          sortOrder: 10,
        },
      ],
      geographyLevelLabel: "county",
      hazardIds: ["hazard-extreme-heat"],
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().completed, true);

  await app.close();
});

test("POST /setup/bootstrap creates the first admin without an existing token", async () => {
  const app = Fastify();
  const service: SetupService = {
    async getStatus() {
      return setupStatus;
    },
    async getOptions() {
      return {
        hazards: [{ id: "hazard-extreme-heat", label: "Extreme heat" }],
      };
    },
    async bootstrapSetup(input) {
      assert.equal(input.admin.username, "chart-admin");
      assert.equal(input.admin.password, "secure-password");

      return {
        setup: {
          ...setupStatus,
          completed: true,
          requiresOnboarding: false,
          countryCode: "GB",
          countryName: "United Kingdom",
          rootGeographyId: "geo-gb",
          firstAdminUserId: "keycloak-admin",
          selectedHazards: [{ id: "hazard-extreme-heat", label: "Extreme heat" }],
          counts: {
            geographies: 1,
            workspaceMembers: 1,
          },
        },
        admin: {
          userId: "keycloak-admin",
          username: "chart-admin",
          email: "chart-admin@example.org",
        },
      };
    },
    async completeSetup() {
      return setupStatus;
    },
    async resetSetup() {
      return setupStatus;
    },
  };

  await app.register(registerSetupRoutes, { prefix: "/setup", service });

  const response = await app.inject({
    method: "POST",
    url: "/setup/bootstrap",
    payload: {
      countryCode: "GB",
      countryName: "United Kingdom",
      geographyLevelLabel: "county",
      hazardIds: ["hazard-extreme-heat"],
      admin: {
        name: "CHART Admin",
        email: "chart-admin@example.org",
        username: "chart-admin",
        password: "secure-password",
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().admin.username, "chart-admin");

  await app.close();
});

test("POST /setup/bootstrap maps identity user conflicts", async () => {
  const app = Fastify();
  const service: SetupService = {
    async getStatus() {
      return setupStatus;
    },
    async getOptions() {
      return {
        hazards: [{ id: "hazard-extreme-heat", label: "Extreme heat" }],
      };
    },
    async bootstrapSetup() {
      throw new SetupError("SETUP_IDENTITY_USER_CONFLICT", 409);
    },
    async completeSetup() {
      return setupStatus;
    },
    async resetSetup() {
      return setupStatus;
    },
  };

  await app.register(registerSetupRoutes, { prefix: "/setup", service });

  const response = await app.inject({
    method: "POST",
    url: "/setup/bootstrap",
    payload: {
      countryCode: "GB",
      countryName: "United Kingdom",
      geographyLevelLabel: "county",
      hazardIds: ["hazard-extreme-heat"],
      admin: {
        name: "CHART Admin",
        email: "chart-admin@example.org",
        username: "chart-admin",
        password: "secure-password",
      },
    },
  });

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.json(), { error: "SETUP_IDENTITY_USER_CONFLICT" });

  await app.close();
});

test("POST /setup/reset maps setup authorization errors", async () => {
  const app = Fastify();
  const service: SetupService = {
    async getStatus() {
      return setupStatus;
    },
    async getOptions() {
      return {
        hazards: [{ id: "hazard-extreme-heat", label: "Extreme heat" }],
      };
    },
    async bootstrapSetup() {
      return {
        setup: setupStatus,
        admin: {
          userId: "keycloak-admin",
          username: "chart-admin",
          email: "chart-admin@example.org",
        },
      };
    },
    async completeSetup() {
      return setupStatus;
    },
    async resetSetup() {
      throw new SetupError("SETUP_FORBIDDEN", 403);
    },
  };

  await app.register(registerSetupRoutes, {
    prefix: "/setup",
    service,
    async getCurrentUser() {
      return currentUser;
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/setup/reset",
    headers: {
      authorization: "Bearer token",
    },
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), { error: "SETUP_FORBIDDEN" });

  await app.close();
});

function createSetupServiceStub(): SetupService {
  return {
    async getStatus() {
      return setupStatus;
    },
    async getOptions() {
      return {
        hazards: [{ id: "hazard-extreme-heat", label: "Extreme heat" }],
      };
    },
    async bootstrapSetup() {
      return {
        setup: setupStatus,
        admin: {
          userId: "keycloak-admin",
          username: "chart-admin",
          email: "chart-admin@example.org",
        },
      };
    },
    async completeSetup() {
      return setupStatus;
    },
    async resetSetup() {
      return setupStatus;
    },
  };
}
