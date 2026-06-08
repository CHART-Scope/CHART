import assert from "node:assert/strict";
import test from "node:test";

import Fastify from "fastify";

import type { CurrentUserContext } from "../auth/types.js";
import { UserError } from "./errors.js";
import { registerUserRoutes } from "./routes.js";
import type { UserService } from "./service.js";
import type { ChartUserRecord, CreateChartUserInput } from "./types.js";

const adminUser: CurrentUserContext = {
  userId: "keycloak-admin",
  username: "chart-admin",
  email: "chart-admin@example.org",
  roles: ["chart_admin"],
  geographyScopes: ["/country-a"],
  activeGeographyId: "/country-a",
  geographyLevel: "country",
};

const planningUser: ChartUserRecord = {
  userId: "keycloak-u1",
  username: "health-lead",
  email: "health-lead@example.org",
  displayName: "Health Lead",
  status: "active",
  roles: ["health_planning_lead"],
  geographyScopes: [
    {
      geographyId: "geo-country-a",
      path: "/country-a",
      name: "Country A",
      levelLabel: "country",
    },
  ],
};

test("GET /users lists app users for chart admins", async () => {
  const app = Fastify();
  const service = createUserServiceStub();

  await app.register(registerUserRoutes, {
    prefix: "/users",
    service,
    async getCurrentUser() {
      return adminUser;
    },
  });

  const response = await app.inject({
    method: "GET",
    url: "/users",
    headers: {
      authorization: "Bearer token",
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), [planningUser]);

  await app.close();
});

test("POST /users creates a Keycloak-backed app user", async () => {
  const app = Fastify();
  const service: UserService = {
    async listUsers() {
      return [];
    },
    async createUser(input, context) {
      assert.equal(context.userId, adminUser.userId);
      assert.deepEqual(input, {
        name: "Health Lead",
        email: "health-lead@example.org",
        username: "health-lead",
        password: "secure-password",
        roles: ["health_planning_lead"],
        geographyIds: ["geo-country-a"],
      } satisfies CreateChartUserInput);

      return planningUser;
    },
    async disableUser() {
      return planningUser;
    },
  };

  await app.register(registerUserRoutes, {
    prefix: "/users",
    service,
    async getCurrentUser() {
      return adminUser;
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/users",
    headers: {
      authorization: "Bearer token",
    },
    payload: {
      name: "Health Lead",
      email: "health-lead@example.org",
      username: "health-lead",
      password: "secure-password",
      roles: ["health_planning_lead"],
      geographyIds: ["geo-country-a"],
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().userId, planningUser.userId);

  await app.close();
});

test("POST /users/:userId/disable maps self-disable protection", async () => {
  const app = Fastify();
  const service: UserService = {
    async listUsers() {
      return [];
    },
    async createUser() {
      return planningUser;
    },
    async disableUser() {
      throw new UserError("USER_CANNOT_DISABLE_SELF", 400);
    },
  };

  await app.register(registerUserRoutes, {
    prefix: "/users",
    service,
    async getCurrentUser() {
      return adminUser;
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/users/keycloak-admin/disable",
    headers: {
      authorization: "Bearer token",
    },
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), { error: "USER_CANNOT_DISABLE_SELF" });

  await app.close();
});

test("GET /users maps non-admin users to forbidden", async () => {
  const app = Fastify();
  const service: UserService = {
    async listUsers() {
      throw new UserError("USER_FORBIDDEN", 403);
    },
    async createUser() {
      return planningUser;
    },
    async disableUser() {
      return planningUser;
    },
  };

  await app.register(registerUserRoutes, {
    prefix: "/users",
    service,
    async getCurrentUser() {
      return {
        ...adminUser,
        roles: ["health_planning_lead"],
      };
    },
  });

  const response = await app.inject({
    method: "GET",
    url: "/users",
    headers: {
      authorization: "Bearer token",
    },
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), { error: "USER_FORBIDDEN" });

  await app.close();
});

function createUserServiceStub(): UserService {
  return {
    async listUsers() {
      return [planningUser];
    },
    async createUser() {
      return planningUser;
    },
    async disableUser() {
      return {
        ...planningUser,
        status: "disabled",
      };
    },
  };
}
