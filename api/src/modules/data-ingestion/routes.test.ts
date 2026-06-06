import assert from "node:assert/strict";
import test from "node:test";

import { buildApp } from "../../app.js";

test("GET /sources returns configured source metadata", async () => {
  const env = withDhis2Env({});
  const app = buildApp();

  try {
    const response = await app.inject({
      method: "GET",
      url: "/sources",
    });

    assert.equal(response.statusCode, 200);

    const body = response.json();
    assert.ok(Array.isArray(body));
    assert.ok(body.length > 0);
    assert.equal(body[0].id, "climate-era5");
    assert.equal(
      body.find((source: { id: string }) => source.id === "health-dhis2")
        .configurationStatus,
      "missing_configuration",
    );
  } finally {
    env.restore();
    await app.close();
  }
});

test("GET /sources/dhis2/config returns masked DHIS2 configuration", async () => {
  const env = withDhis2Env({
    DHIS2_BASE_URL: "https://dhis2.example.org/",
    DHIS2_AUTH_MODE: "pat",
    DHIS2_API_TOKEN: "secret-token",
    DHIS2_API_VERSION: "41",
  });
  const app = buildApp();

  try {
    const response = await app.inject({
      method: "GET",
      url: "/sources/dhis2/config",
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      sourceId: "health-dhis2",
      baseUrl: "https://dhis2.example.org",
      apiVersion: "41",
      authMode: "pat",
      credentialConfigured: true,
      configured: true,
      meUrl: "https://dhis2.example.org/api/41/me",
    });
    assert.equal(response.body.includes("secret-token"), false);
  } finally {
    env.restore();
    await app.close();
  }
});

test("POST /sources/dhis2/test-connection calls DHIS2 with configured credentials", async () => {
  const env = withDhis2Env({
    DHIS2_BASE_URL: "https://dhis2.example.org",
    DHIS2_AUTH_MODE: "pat",
    DHIS2_API_TOKEN: "secret-token",
    DHIS2_API_VERSION: "41",
  });
  const originalFetch = globalThis.fetch;
  const app = buildApp();

  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://dhis2.example.org/api/41/me");
    assert.equal(
      new Headers(init?.headers).get("authorization"),
      "ApiToken secret-token",
    );

    return new Response(JSON.stringify({ username: "chart-service-user" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const response = await app.inject({
      method: "POST",
      url: "/sources/dhis2/test-connection",
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      sourceId: "health-dhis2",
      status: "connected",
      meUrl: "https://dhis2.example.org/api/41/me",
      httpStatus: 200,
      username: "chart-service-user",
    });
  } finally {
    globalThis.fetch = originalFetch;
    env.restore();
    await app.close();
  }
});

test("POST /sources/dhis2/test-connection reports missing configuration", async () => {
  const env = withDhis2Env({});
  const app = buildApp();

  try {
    const response = await app.inject({
      method: "POST",
      url: "/sources/dhis2/test-connection",
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().status, "missing_configuration");
  } finally {
    env.restore();
    await app.close();
  }
});

test("GET /sources/:sourceId returns 404 for an unknown source", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "GET",
    url: "/sources/unknown",
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), { error: "SOURCE_NOT_FOUND" });

  await app.close();
});

test("POST /sources/:sourceId/sync queues a source sync", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "POST",
    url: "/sources/climate-era5/sync",
  });

  assert.equal(response.statusCode, 202);
  assert.deepEqual(response.json(), {
    sourceId: "climate-era5",
    status: "queued",
  });

  await app.close();
});

function withDhis2Env(values: NodeJS.ProcessEnv) {
  const keys = [
    "DHIS2_BASE_URL",
    "DHIS2_AUTH_MODE",
    "DHIS2_API_TOKEN",
    "DHIS2_USERNAME",
    "DHIS2_PASSWORD",
    "DHIS2_BEARER_TOKEN",
    "DHIS2_API_VERSION",
  ];
  const originalValues = new Map(keys.map((key) => [key, process.env[key]]));

  for (const key of keys) {
    delete process.env[key];
  }

  Object.assign(process.env, values);

  return {
    restore() {
      for (const key of keys) {
        const value = originalValues.get(key);

        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    },
  };
}
