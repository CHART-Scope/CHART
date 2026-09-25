import { expect, test } from "@playwright/test";

import { installFakeApi, json } from "./support/fakeApi";

const callback = "/auth/callback?code=e2e-code&state=e2e-state";

test("a failed sign-in never falls back to a session already in the browser", async ({
  page,
}) => {
  // The browser still holds someone's refresh cookie (the fake refresh
  // endpoint succeeds), but this sign-in's PKCE cookie expired, so the
  // exchange answers AUTH_CALLBACK_INVALID.
  const api = await installFakeApi(page);
  api.on(/^\/api\/auth\/keycloak-exchange$/, (route) =>
    json(route, { error: "AUTH_CALLBACK_INVALID" }, 400),
  );

  await page.goto(callback);

  await expect(page.getByRole("heading", { name: "Sign-in failed" })).toBeVisible();
  expect(page.url()).toContain("/auth/callback");
  expect(api.requests).not.toContain("POST /api/auth/keycloak-refresh");
});

test("reloading after a successful sign-in reuses the session, not the code", async ({
  page,
}) => {
  const api = await installFakeApi(page);
  let exchanges = 0;
  api.on(/^\/api\/auth\/keycloak-exchange$/, (route) => {
    exchanges += 1;
    return exchanges === 1
      ? json(route, { access_token: "unused" }, 200)
      : json(route, { error: "AUTH_CALLBACK_INVALID" }, 400);
  });

  await page.goto(callback);
  await page.waitForURL("**/plan**");

  // Back to the same callback URL, as a reload or history step would.
  await page.goto(callback);
  await page.waitForURL("**/plan**");

  expect(exchanges).toBe(1);
  expect(api.requests).toContain("POST /api/auth/keycloak-refresh");
});
