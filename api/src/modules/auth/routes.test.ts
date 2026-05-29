import assert from "node:assert/strict";
import { generateKeyPairSync, type KeyObject, sign as signJwtInput } from "node:crypto";
import test from "node:test";

import { buildApp } from "../../app.js";
import {
  canReadGeographyPath,
  canSelectActiveGeography,
  getCurrentUserContext,
  mapKeycloakClaimsToCurrentUserContext,
} from "./service.js";
import type { KeycloakTokenClaims } from "./types.js";

test("GET /auth/me returns the current role and geography context", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "GET",
    url: "/auth/me",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json();
  assert.equal(body.userId, "user-u1-demo");
  assert.deepEqual(body.roles, ["u1_health_lead"]);
  assert.deepEqual(body.geographyScopes, ["/india/madhya-pradesh"]);
  assert.equal(body.activeGeographyId, "/india/madhya-pradesh");
  assert.equal(body.geographyLevel, "geo_level_1");

  await app.close();
});

test("GET /auth/me rejects an active geography outside the user's token scopes", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "GET",
    url: "/auth/me?activeGeography=/kenya/kajiado",
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), { error: "ACTIVE_GEOGRAPHY_OUT_OF_SCOPE" });

  await app.close();
});

test("GET /auth/geography-access allows child geographies inside the user's scope", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "GET",
    url: "/auth/geography-access?geography=/india/madhya-pradesh/gwalior",
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    canAccess: true,
    geographyPath: "/india/madhya-pradesh/gwalior",
    userId: "user-u1-demo",
  });

  await app.close();
});

test("GET /auth/geography-access rejects unrelated geography paths", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "GET",
    url: "/auth/geography-access?geography=/india/rajasthan",
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), { error: "GEOGRAPHY_OUT_OF_SCOPE" });

  await app.close();
});

test("Keycloak claims map into CHART roles and geography scopes", () => {
  const context = mapKeycloakClaimsToCurrentUserContext(
    {
      sub: "keycloak-user-1",
      preferred_username: "gwalior-health",
      email: "gwalior@example.org",
      groups: ["/india/madhya-pradesh/gwalior"],
      resource_access: {
        "chart-api": {
          roles: ["u3_district_health_officer", "unrelated_role"],
        },
      },
    },
    "chart-api",
  );

  assert.equal(context.userId, "keycloak-user-1");
  assert.equal(context.username, "gwalior-health");
  assert.deepEqual(context.roles, ["u3_district_health_officer"]);
  assert.deepEqual(context.geographyScopes, ["/india/madhya-pradesh/gwalior"]);
  assert.equal(context.geographyLevel, "geo_level_2");
});

test("geography access allows assigned, child, and parent context but rejects peers", () => {
  const context = mapKeycloakClaimsToCurrentUserContext(
    {
      sub: "keycloak-user-2",
      preferred_username: "gwalior-health",
      groups: ["/india/madhya-pradesh/gwalior"],
      resource_access: {
        "chart-api": {
          roles: ["u3_district_health_officer"],
        },
      },
    },
    "chart-api",
  );

  assert.equal(canReadGeographyPath(context, "/india/madhya-pradesh/gwalior"), true);
  assert.equal(
    canReadGeographyPath(context, "/india/madhya-pradesh/gwalior/block-1"),
    true,
  );
  assert.equal(canReadGeographyPath(context, "/india/madhya-pradesh"), true);
  assert.equal(canReadGeographyPath(context, "/india/madhya-pradesh/indore"), false);
  assert.equal(canSelectActiveGeography(context, "/india/madhya-pradesh"), false);
  assert.equal(
    canSelectActiveGeography(context, "/india/madhya-pradesh/gwalior"),
    true,
  );
});

test("Keycloak mode verifies an RS256 token and builds current user context", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const publicJwk = publicKey.export({ format: "jwk" });
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        keys: [
          {
            ...publicJwk,
            kid: "chart-test-key",
            alg: "RS256",
            use: "sig",
          },
        ],
      }),
      {
        headers: { "content-type": "application/json" },
        status: 200,
      },
    );

  try {
    const issuerUrl = "http://keycloak.test/realms/chart";
    const token = signTestJwt(
      {
        sub: "verified-user",
        preferred_username: "verified-health-lead",
        iss: issuerUrl,
        exp: Math.floor(Date.now() / 1000) + 300,
        groups: ["/kenya/kajiado"],
        resource_access: {
          "chart-api": {
            roles: ["u1_health_lead"],
          },
        },
      },
      privateKey,
    );

    const context = await getCurrentUserContext(
      { authorization: `Bearer ${token}` },
      {
        mode: "keycloak",
        issuerUrl,
        clientId: "chart-api",
        jwksUrl: "http://keycloak.test/certs",
        clockSkewSeconds: 0,
      },
    );

    assert.equal(context.userId, "verified-user");
    assert.deepEqual(context.roles, ["u1_health_lead"]);
    assert.deepEqual(context.geographyScopes, ["/kenya/kajiado"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function signTestJwt(claims: KeycloakTokenClaims, privateKey: KeyObject): string {
  const encodedHeader = base64UrlEncode({
    alg: "RS256",
    kid: "chart-test-key",
    typ: "JWT",
  });
  const encodedPayload = base64UrlEncode(claims);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = signJwtInput(
    "RSA-SHA256",
    Buffer.from(signingInput),
    privateKey,
  ).toString("base64url");

  return `${signingInput}.${signature}`;
}

function base64UrlEncode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
