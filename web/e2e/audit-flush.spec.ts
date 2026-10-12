import { expect, test } from "@playwright/test";

import { fakeJwt, installFakeApi, json } from "./support/fakeApi";

test("audit events are sent with a refreshed token after the tab slept", async ({
  page,
}) => {
  const start = new Date("2026-09-25T12:00:00Z");
  await page.clock.install({ time: start });
  const api = await installFakeApi(page);

  // Keycloak's default: a token valid for five minutes, a new one on refresh.
  const issued: string[] = [];
  api.on(/^\/api\/auth\/keycloak-refresh$/, async (route) => {
    const now = Math.floor((await page.evaluate(() => Date.now())) / 1000);
    const token = fakeJwt({ sub: "e2e-user", n: issued.length, exp: now + 300 });
    issued.push(token);
    return json(route, { access_token: token });
  });
  const auditTokens: string[] = [];
  api.on(/^\/api\/chart\/audit\/events$/, (route) => {
    const token = route.request().headers().authorization?.replace("Bearer ", "") ?? "";
    auditTokens.push(token);
    // The API rejects an expired token, as Keycloak verification does.
    return token === issued.at(-1)
      ? json(route, { accepted: 1, duplicates: 0 }, 200)
      : json(route, { error: "AUTH_TOKEN_INVALID" }, 401);
  });

  await page.goto(
    "/dashboard/geo-in-mp?admin_unit=geo-in-mp-bhopal&outcome=lbw&month=2026-08",
  );
  await expect(page.getByRole("group", { name: "Dashboard context" })).toBeVisible();
  expect(issued).toHaveLength(1);

  // Ten minutes pass without the refresh timer firing - a throttled hidden
  // tab - and then the tab is hidden, which flushes the audit buffer.
  await page.clock.setSystemTime(new Date(start.getTime() + 10 * 60_000));
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  await expect.poll(() => auditTokens.length).toBeGreaterThan(0);
  expect(issued).toHaveLength(2);
  expect(auditTokens).toEqual([issued[1]]);
});
