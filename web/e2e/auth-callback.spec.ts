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
  await page.waitForURL("**/dashboard/geo-in-mp");

  // Back to the same callback URL, as a reload or history step would.
  await page.goto(callback);
  await page.waitForURL("**/dashboard/geo-in-mp");

  expect(exchanges).toBe(1);
  expect(api.requests).toContain("POST /api/auth/keycloak-refresh");
});

test("signing in returns to the page that asked for it, never off-site", async ({
  page,
}) => {
  const api = await installFakeApi(page);
  api.on(/^\/api\/auth\/keycloak-exchange$/, (route) =>
    json(route, { access_token: "unused" }, 200),
  );
  api.on(/^\/api\/setup$/, (route) => json(route, { requiresOnboarding: false }));
  const remember = async (path: string) => {
    await page.goto("/");
    await page.evaluate(
      (value) => window.sessionStorage.setItem("chart.auth.returnTo", value),
      path,
    );
  };

  // Explore's "Plan for Bhopal Division" remembered its dashboard.
  await remember("/dashboard/geo-in-mp?admin_unit=geo-in-mp-bhopal&outcome=lbw");
  await page.goto(callback);
  await page.waitForURL(
    "**/dashboard/geo-in-mp?admin_unit=geo-in-mp-bhopal&outcome=lbw",
  );
  expect(
    await page.evaluate(() => window.sessionStorage.getItem("chart.auth.returnTo")),
  ).toBeNull();

  // Another site, or another sign-in round, is never a destination.
  await remember("//evil.example/steal");
  await page.goto(callback);
  await page.waitForURL("**/dashboard/geo-in-mp");
  expect(new URL(page.url()).host).toBe("127.0.0.1:" + new URL(page.url()).port);
});

test("signing in opens the dashboard of the planner's own area", async ({ page }) => {
  const api = await installFakeApi(page);
  api.on(/^\/api\/auth\/keycloak-exchange$/, (route) =>
    json(route, { access_token: "unused" }, 200),
  );

  // India scope: Madhya Pradesh is its one modelled state, so that is the area.
  await page.goto(callback);
  await page.waitForURL("**/dashboard/geo-in-mp");
  await expect(page.getByRole("heading", { name: "Sign-in failed" })).toHaveCount(0);
});

test("when the areas cannot be read, sign-in still lands on the Planning center", async ({
  page,
}) => {
  const api = await installFakeApi(page);
  api.on(/^\/api\/auth\/keycloak-exchange$/, (route) =>
    json(route, { access_token: "unused" }, 200),
  );
  api.on(/^\/api\/chart\/geographies$/, (route) =>
    json(route, { error: "GEOGRAPHIES_UNAVAILABLE" }, 503),
  );

  await page.goto(callback);
  await page.waitForURL("**/plan");
});

test("the default admin, before setup gives it an area, lands on Settings → Workspace to manage people, or back on setup", async ({
  page,
}) => {
  const api = await installFakeApi(page);
  api.on(/^\/api\/auth\/keycloak-exchange$/, (route) =>
    json(route, { access_token: "unused" }, 200),
  );
  api.on(/^\/api\/chart\/auth\/me$/, (route) =>
    json(route, {
      userId: "admin-1",
      username: "admin",
      roles: ["chart_admin", "content_editor"],
      geographyScopes: [],
    }),
  );
  api.on(/^\/api\/setup$/, (route) => json(route, { requiresOnboarding: false }));

  await page.goto(callback);
  await page.waitForURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "People and access" })).toBeVisible();

  // "Set up CHART" asked for sign-in: the admin goes back to setup.
  await page.evaluate(() =>
    window.sessionStorage.setItem("chart.auth.returnTo", "/onboarding"),
  );
  await page.goto(callback);
  await page.waitForURL("**/onboarding");
});
