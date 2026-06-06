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

const testIssuerUrl = "http://keycloak.test/realms/chart";
const testJwksUrl = "http://keycloak.test/certs";

test("GET /auth/me resolves a U1 Keycloak JWT into role and geography context", async () => {
  const auth = installKeycloakTestAuth({
    sub: "keycloak-u1",
    preferred_username: "u1-health-region",
    email: "u1-health-region@example.org",
    iss: testIssuerUrl,
    exp: Math.floor(Date.now() / 1000) + 300,
    groups: ["/country-a/region-a"],
    resource_access: {
      "chart-api": {
        roles: ["u1_health_lead"],
      },
    },
  });
  const app = buildApp();

  try {
    const response = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: {
        authorization: `Bearer ${auth.token}`,
      },
    });

    assert.equal(response.statusCode, 200);

    const body = response.json();
    assert.equal(body.userId, "keycloak-u1");
    assert.equal(body.username, "u1-health-region");
    assert.deepEqual(body.roles, ["u1_health_lead"]);
    assert.deepEqual(body.geographyScopes, ["/country-a/region-a"]);
    assert.equal(body.activeGeographyId, "/country-a/region-a");
    assert.equal(body.geographyLevel, "geo_level_1");
  } finally {
    auth.restore();
    await app.close();
  }
});

test("GET /auth/me resolves a U2 Keycloak JWT into its own scope", async () => {
  const auth = installKeycloakTestAuth({
    sub: "keycloak-u2",
    preferred_username: "u2-sector-region",
    email: "u2-sector-region@example.org",
    iss: testIssuerUrl,
    exp: Math.floor(Date.now() / 1000) + 300,
    groups: ["/country-b/region-b"],
    resource_access: {
      "chart-api": {
        roles: ["u2_cross_sector_lead"],
      },
    },
  });
  const app = buildApp();

  try {
    const response = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: {
        authorization: `Bearer ${auth.token}`,
      },
    });

    assert.equal(response.statusCode, 200);

    const body = response.json();
    assert.equal(body.userId, "keycloak-u2");
    assert.deepEqual(body.roles, ["u2_cross_sector_lead"]);
    assert.deepEqual(body.geographyScopes, ["/country-b/region-b"]);
  } finally {
    auth.restore();
    await app.close();
  }
});

test("GET /auth/me requires a Keycloak JWT", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "GET",
    url: "/auth/me",
  });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.json(), { error: "AUTH_TOKEN_REQUIRED" });

  await app.close();
});

test("GET /auth/me allows the local web origin", async () => {
  const auth = installKeycloakTestAuth({
    sub: "keycloak-u1",
    preferred_username: "u1-health-region",
    iss: testIssuerUrl,
    exp: Math.floor(Date.now() / 1000) + 300,
    groups: ["/country-a/region-a"],
    resource_access: {
      "chart-api": {
        roles: ["u1_health_lead"],
      },
    },
  });
  const app = buildApp();

  try {
    const response = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: {
        origin: "http://127.0.0.1:3100",
        authorization: `Bearer ${auth.token}`,
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(
      response.headers["access-control-allow-origin"],
      "http://127.0.0.1:3100",
    );
  } finally {
    auth.restore();
    await app.close();
  }
});

test("GET /auth/me rejects an active geography outside the user's token scopes", async () => {
  const auth = installKeycloakTestAuth({
    sub: "keycloak-u1",
    preferred_username: "u1-health-region",
    iss: testIssuerUrl,
    exp: Math.floor(Date.now() / 1000) + 300,
    groups: ["/country-a/region-a"],
    resource_access: {
      "chart-api": {
        roles: ["u1_health_lead"],
      },
    },
  });
  const app = buildApp();

  try {
    const response = await app.inject({
      method: "GET",
      url: "/auth/me?activeGeography=/country-b/region-b",
      headers: {
        authorization: `Bearer ${auth.token}`,
      },
    });

    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.json(), { error: "ACTIVE_GEOGRAPHY_OUT_OF_SCOPE" });
  } finally {
    auth.restore();
    await app.close();
  }
});

test("GET /auth/geography-access allows child geographies inside the user's scope", async () => {
  const auth = installKeycloakTestAuth({
    sub: "keycloak-u1",
    preferred_username: "u1-health-region",
    iss: testIssuerUrl,
    exp: Math.floor(Date.now() / 1000) + 300,
    groups: ["/country-a/region-a"],
    resource_access: {
      "chart-api": {
        roles: ["u1_health_lead"],
      },
    },
  });
  const app = buildApp();

  try {
    const response = await app.inject({
      method: "GET",
      url: "/auth/geography-access?geography=/country-a/region-a/district-a",
      headers: {
        authorization: `Bearer ${auth.token}`,
      },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      canAccess: true,
      geographyPath: "/country-a/region-a/district-a",
      userId: "keycloak-u1",
    });
  } finally {
    auth.restore();
    await app.close();
  }
});

test("GET /auth/geography-access rejects unrelated geography paths", async () => {
  const auth = installKeycloakTestAuth({
    sub: "keycloak-u1",
    preferred_username: "u1-health-region",
    iss: testIssuerUrl,
    exp: Math.floor(Date.now() / 1000) + 300,
    groups: ["/country-a/region-a"],
    resource_access: {
      "chart-api": {
        roles: ["u1_health_lead"],
      },
    },
  });
  const app = buildApp();

  try {
    const response = await app.inject({
      method: "GET",
      url: "/auth/geography-access?geography=/country-a/region-b",
      headers: {
        authorization: `Bearer ${auth.token}`,
      },
    });

    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.json(), { error: "GEOGRAPHY_OUT_OF_SCOPE" });
  } finally {
    auth.restore();
    await app.close();
  }
});

test("role and geography access checks cover U1-U4 planning scopes", async () => {
  const scenarios = [
    {
      name: "U1 state health lead can read state, child districts, and country context",
      sub: "keycloak-u1",
      username: "u1-health-region",
      role: "u1_health_lead",
      scope: "/country-a/region-a",
      allowed: ["/country-a", "/country-a/region-a", "/country-a/region-a/district-a"],
      denied: ["/country-b/region-b", "/country-a/region-b"],
    },
    {
      name: "U2 county cross-sector lead can read county, child sub-counties, and country context",
      sub: "keycloak-u2",
      username: "u2-sector-region",
      role: "u2_cross_sector_lead",
      scope: "/country-b/region-b",
      allowed: ["/country-b", "/country-b/region-b", "/country-b/region-b/district-c"],
      denied: ["/country-a/region-a", "/country-b/region-c"],
    },
    {
      name: "U3 district health officer can read own district and parent context, not peer districts",
      sub: "keycloak-u3",
      username: "u3-health-district",
      role: "u3_district_health_officer",
      scope: "/country-a/region-a/district-a",
      allowed: ["/country-a", "/country-a/region-a", "/country-a/region-a/district-a"],
      denied: ["/country-a/region-a/district-b", "/country-b/region-b"],
    },
    {
      name: "U4 sub-county cross-sector officer can read own sub-county and parent context, not peers",
      sub: "keycloak-u4",
      username: "u4-sector-district",
      role: "u4_district_cross_sector_officer",
      scope: "/country-b/region-b/district-c",
      allowed: ["/country-b", "/country-b/region-b", "/country-b/region-b/district-c"],
      denied: ["/country-b/region-b/district-d", "/country-a/region-a"],
    },
  ];

  for (const scenario of scenarios) {
    const auth = installKeycloakTestAuth({
      sub: scenario.sub,
      preferred_username: scenario.username,
      iss: testIssuerUrl,
      exp: Math.floor(Date.now() / 1000) + 300,
      groups: [scenario.scope],
      resource_access: {
        "chart-api": {
          roles: [scenario.role],
        },
      },
    });
    const app = buildApp();

    try {
      for (const geography of scenario.allowed) {
        const response = await app.inject({
          method: "GET",
          url: `/auth/geography-access?geography=${encodeURIComponent(geography)}`,
          headers: {
            authorization: `Bearer ${auth.token}`,
          },
        });

        assert.equal(response.statusCode, 200, `${scenario.name}: ${geography}`);
      }

      for (const geography of scenario.denied) {
        const response = await app.inject({
          method: "GET",
          url: `/auth/geography-access?geography=${encodeURIComponent(geography)}`,
          headers: {
            authorization: `Bearer ${auth.token}`,
          },
        });

        assert.equal(response.statusCode, 403, `${scenario.name}: ${geography}`);
      }
    } finally {
      auth.restore();
      await app.close();
    }
  }
});

test("Keycloak claims map into CHART roles and geography scopes", () => {
  const context = mapKeycloakClaimsToCurrentUserContext(
    {
      sub: "keycloak-user-1",
      preferred_username: "district-health",
      email: "district@example.org",
      groups: ["/country-a/region-a/district-a"],
      resource_access: {
        "chart-api": {
          roles: ["u3_district_health_officer", "unrelated_role"],
        },
      },
    },
    "chart-api",
  );

  assert.equal(context.userId, "keycloak-user-1");
  assert.equal(context.username, "district-health");
  assert.deepEqual(context.roles, ["u3_district_health_officer"]);
  assert.deepEqual(context.geographyScopes, ["/country-a/region-a/district-a"]);
  assert.equal(context.geographyLevel, "geo_level_2");
});

test("geography access allows assigned, child, and parent context but rejects peers", () => {
  const context = mapKeycloakClaimsToCurrentUserContext(
    {
      sub: "keycloak-user-2",
      preferred_username: "district-health",
      groups: ["/country-a/region-a/district-a"],
      resource_access: {
        "chart-api": {
          roles: ["u3_district_health_officer"],
        },
      },
    },
    "chart-api",
  );

  assert.equal(canReadGeographyPath(context, "/country-a/region-a/district-a"), true);
  assert.equal(
    canReadGeographyPath(context, "/country-a/region-a/district-a/local-area-1"),
    true,
  );
  assert.equal(canReadGeographyPath(context, "/country-a/region-a"), true);
  assert.equal(canReadGeographyPath(context, "/country-a/region-a/district-b"), false);
  assert.equal(canSelectActiveGeography(context, "/country-a/region-a"), true);
  assert.equal(
    canSelectActiveGeography(context, "/country-a/region-a/district-a"),
    true,
  );
  assert.equal(
    canSelectActiveGeography(context, "/country-a/region-a/district-b"),
    false,
  );
});

test("API verifies an RS256 token and builds current user context", async () => {
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
    const token = signTestJwt(
      {
        sub: "verified-user",
        preferred_username: "verified-health-lead",
        iss: testIssuerUrl,
        exp: Math.floor(Date.now() / 1000) + 300,
        groups: ["/country-b/region-b"],
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
        issuerUrl: testIssuerUrl,
        clientId: "chart-api",
        jwksUrl: testJwksUrl,
        clockSkewSeconds: 0,
      },
    );

    assert.equal(context.userId, "verified-user");
    assert.deepEqual(context.roles, ["u1_health_lead"]);
    assert.deepEqual(context.geographyScopes, ["/country-b/region-b"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function installKeycloakTestAuth(claims: KeycloakTokenClaims) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const publicJwk = publicKey.export({ format: "jwk" });
  const originalFetch = globalThis.fetch;
  const originalIssuerUrl = process.env.KEYCLOAK_ISSUER_URL;
  const originalJwksUrl = process.env.KEYCLOAK_JWKS_URL;
  const originalClientId = process.env.KEYCLOAK_CLIENT_ID;

  process.env.KEYCLOAK_ISSUER_URL = testIssuerUrl;
  process.env.KEYCLOAK_JWKS_URL = testJwksUrl;
  process.env.KEYCLOAK_CLIENT_ID = "chart-api";
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

  return {
    token: signTestJwt(claims, privateKey),
    restore() {
      globalThis.fetch = originalFetch;
      restoreEnv("KEYCLOAK_ISSUER_URL", originalIssuerUrl);
      restoreEnv("KEYCLOAK_JWKS_URL", originalJwksUrl);
      restoreEnv("KEYCLOAK_CLIENT_ID", originalClientId);
    },
  };
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

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
