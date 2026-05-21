import assert from "node:assert/strict";
import test from "node:test";

import { buildApp } from "../../app.js";

test("GET /auth/me returns the current user geography context", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "GET",
    url: "/auth/me",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json();
  assert.equal(body.role, "U1_STATE_COUNTY_HEALTH_OFFICER");
  assert.equal(body.geographyScope.id, "geo-madhya-pradesh");

  await app.close();
});
