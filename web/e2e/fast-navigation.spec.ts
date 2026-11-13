import { expect, test, type Page } from "@playwright/test";

import {
  accessToken,
  geographies,
  installFakeApi,
  json,
  type FakeApi,
} from "./support/fakeApi";
import { installKenya } from "./support/kenya";

// Moving around the signed-in app reuses what it already has. A new place
// updates the mounted dashboard instead of rebuilding it; a place, page or
// Settings tab seen before answers from the shared query cache instead of the
// network. Each spec counts the requests the real build sends to the fake API.

const evidence = "../outputs/e2e/web/fast-navigation";

// Two districts under Gwalior, so opening Gwalior is a move to a new place.
const withDistricts = [
  ...geographies,
  ...["Datia", "Shivpuri"].map((name) => ({
    ...geographies.find((geo) => geo.id === "geo-in-mp-gwalior")!,
    id: `geo-in-mp-gwalior-${name.toLowerCase()}`,
    name,
    parentId: "geo-in-mp-gwalior",
    level: "district",
    levelLabel: "District",
  })),
];

const count = (api: FakeApi, pattern: RegExp) =>
  api.requests.filter((request) => pattern.test(request)).length;

async function openState(page: Page) {
  const api = await installFakeApi(page);
  api.on(/^\/api\/chart\/geographies$/, (route) => json(route, withDistricts));
  await page.goto("/dashboard/geo-in-mp?outcome=lbw&month=2026-08");
  await expect(page.locator("svg path[data-interactive]").first()).toBeVisible();
  return api;
}

test("a new place updates the mounted dashboard instead of rebuilding it", async ({
  page,
}) => {
  const api = await openState(page);
  // Mark the dashboard and its map; a remount would replace both elements.
  await page
    .locator("#app-shell-main main")
    .evaluate((element) => element.setAttribute("data-e2e-kept", "dashboard"));
  await page
    .locator("svg:has(path[data-interactive])")
    .first()
    .evaluate((element) => element.setAttribute("data-e2e-kept", "map"));

  await page
    .getByRole("button", { name: /^Gwalior/ })
    .first()
    .click();
  await page.waitForURL(/\/dashboard\/geo-in-mp-gwalior\?/);
  await expect
    .poll(() => count(api, /^GET \/api\/chart\/risk\/geo-in-mp-gwalior\/map/))
    .toBeGreaterThan(0);
  await expect(page.locator("svg path[data-interactive]").first()).toBeVisible();

  await expect(page.locator('main[data-e2e-kept="dashboard"]')).toHaveCount(1);
  await expect(page.locator('svg[data-e2e-kept="map"]')).toHaveCount(1);
  await expect(
    page.getByRole("combobox", { name: "State", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: `${evidence}/place-switch-kept.png` });
  // The place list was read once for the visit, not once per place.
  expect(count(api, /^GET \/api\/chart\/geographies$/)).toBe(1);
  expect(api.unhandled).toEqual([]);
});

test("an in-app return to a county does not read it again", async ({ page }) => {
  const api = await installKenya(page);
  await page.goto("/dashboard/geo-ke?admin_unit=geo-ke-kajiado&outcome=lbw");
  const observedKajiado = /^GET \/api\/chart\/heat-outlook\/geo-ke-kajiado\/observed\?/;
  await expect.poll(() => count(api, observedKajiado)).toBe(1);

  await page
    .getByRole("button", { name: /^Garissa/ })
    .first()
    .click();
  await page.waitForURL(/admin_unit=geo-ke-garissa/);
  await expect
    .poll(() =>
      count(api, /^GET \/api\/chart\/heat-outlook\/geo-ke-garissa\/observed\?/),
    )
    .toBe(1);
  await page.goBack();
  await page.waitForURL(/admin_unit=geo-ke-kajiado/);
  await expect(page.getByText(/What share of/).first()).toBeVisible();
  expect(count(api, observedKajiado)).toBe(1);
  expect(api.unhandled).toEqual([]);
});

test("pages read the place list once for the whole visit", async ({ page }) => {
  const api = await openState(page);
  const nav = page.getByRole("navigation", { name: "Main" });
  const entry = (name: string) => nav.getByRole("link", { name, exact: true });

  await entry("Planning center").click();
  await expect(page).toHaveURL(/\/plan$/);
  await expect(page.getByText("in Madhya Pradesh.")).toBeVisible();
  await entry("Settings").click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByText("Planning location")).toBeVisible();
  await entry("Planning center").click();
  await expect(page.getByText("in Madhya Pradesh.")).toBeVisible();
  await page.screenshot({ path: `${evidence}/plan-return.png` });

  expect(count(api, /^GET \/api\/chart\/geographies$/)).toBe(1);
  // Saved plans redraw from memory at once and refresh behind the page.
  expect(count(api, /^GET \/api\/chart\/saved-plans$/)).toBe(2);
});

test("a Settings tab opened before comes back without reloading", async ({ page }) => {
  const api = await installKenya(page);
  await page.goto("/settings?tab=models");
  const tablist = page.getByRole("tablist", { name: "Settings sections" });
  await expect.poll(() => count(api, /^GET \/api\/chart\/model-settings$/)).toBe(1);
  const picker = page.getByRole("heading", { name: "What the dashboard offers" });
  await expect(picker).toBeVisible();

  await tablist.getByRole("tab", { name: "Workspace", exact: true }).click();
  await expect(page.getByText("Planning location")).toBeVisible();
  await expect(picker).toBeHidden();
  await tablist.getByRole("tab", { name: "Models" }).click();
  await expect(page).toHaveURL(/\?tab=models$/);
  await expect(picker).toBeVisible();
  await expect(page.getByText("Planning location")).toBeHidden();
  await page.screenshot({ path: `${evidence}/settings-tab-return.png` });

  expect(count(api, /^GET \/api\/chart\/model-settings$/)).toBe(1);
});

test("saving model settings makes the kept dashboard read its views again", async ({
  page,
}) => {
  // Kenya's Workspace admin: model settings are changed with risk manage.
  const api = await installKenya(page, true, ["/kenya"], {
    who: { role: "workspace_admin" },
  });
  await page.goto("/dashboard/geo-ke?admin_unit=geo-ke-kajiado&outcome=lbw");
  const outlook = page.getByTestId("heat-outlook");
  await expect(outlook.getByTestId("outlook-estimate")).toContainText("Kajiado");
  // Only the whole pregnancy is on, so the dashboard offers no window choice.
  await expect(outlook.getByRole("combobox", { name: "Pregnancy window" })).toHaveCount(
    0,
  );
  const observedKajiado = /^GET \/api\/chart\/heat-outlook\/geo-ke-kajiado\/observed\?/;
  expect(count(api, observedKajiado)).toBe(1);

  // In the app, not a reload: the query cache survives the trip to Settings.
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Settings", exact: true })
    .click();
  await page
    .getByRole("tablist", { name: "Settings sections" })
    .getByRole("tab", { name: "Models" })
    .click();
  const lbw = page.getByRole("group", { name: "Low birth weight", exact: true });
  await lbw
    .getByRole("group", { name: "Pregnancy windows" })
    .getByRole("checkbox", { name: /3rd trimester/ })
    .check();
  await lbw.getByRole("button", { name: "Save Low birth weight" }).click();
  await expect(lbw.getByRole("status")).toHaveText("Saved.");

  await page.goBack();
  await page.waitForURL(/\/dashboard\/geo-ke\?/);
  // The saved setting reaches the dashboard: it read Kajiado again.
  await expect(
    outlook.getByRole("combobox", { name: "Pregnancy window" }),
  ).toBeVisible();
  expect(count(api, observedKajiado)).toBe(2);
  await page.screenshot({ path: `${evidence}/settings-saved-dashboard.png` });
});

test("after the first map, the dashboard asks only for values and keeps the outlines", async ({
  page,
}) => {
  const api = await installKenya(page);
  await page.goto("/dashboard/geo-ke?admin_unit=geo-ke-kajiado&outcome=lbw");
  const outlook = page.getByTestId("heat-outlook");
  const areas = outlook.locator("svg path[data-interactive]");
  await expect(areas.first()).toBeVisible();
  const drawn = await areas.count();
  expect(drawn).toBeGreaterThan(1);

  const maps = () =>
    api.requests.filter((request) =>
      /^GET \/api\/chart\/heat-outlook\/geo-ke\/.*map\?/.test(request),
    );
  // The first map carries the outlines; the other tab's map (Projected; this
  // place has no forecast), fetched ahead, carries values only.
  await expect.poll(() => maps().length).toBe(2);
  expect(maps()[0]).not.toContain("geometry=false");
  expect(
    maps()
      .slice(1)
      .every((request) => request.includes("geometry=false")),
  ).toBe(true);

  for (const tab of ["Projected", "Observed"]) {
    await outlook.getByRole("tab", { name: tab }).click();
    // Every county is still drawn, from the kept outlines.
    await expect(areas).toHaveCount(drawn);
    await expect(outlook.getByLabel("Loading the risk map")).toHaveCount(0);
  }
  await page.screenshot({ path: `${evidence}/values-only-map.png` });
  expect(maps().filter((request) => !request.includes("geometry=false"))).toHaveLength(
    1,
  );
});

test("a reload draws what this tab already read, then refreshes it", async ({
  page,
}) => {
  const api = await installKenya(page);
  await page.goto("/dashboard/geo-ke?admin_unit=geo-ke-kajiado&outcome=lbw");
  const outlook = page.getByTestId("heat-outlook");
  const estimate = outlook.getByTestId("outlook-estimate");
  await expect(estimate).toContainText("may be attributable to heat exposure.");
  const shown = (await estimate.textContent()) ?? "";
  await expect(outlook.locator("svg path[data-interactive]").first()).toBeVisible();
  // Let the debounced write of the cache land.
  await page.waitForTimeout(600);

  // Hold every published read: whatever the card shows came from the tab.
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/chart/heat-outlook/**", async (route) => {
    await held;
    await route.fallback();
  });
  await page.route("**/api/chart/geographies", async (route) => {
    await held;
    await route.fallback();
  });
  const before = api.requests.length;
  await page.reload();
  await expect(estimate).toHaveText(shown);
  await expect(page.getByRole("combobox", { name: "County" })).toBeVisible();
  await expect(page.getByTestId("dashboard-panel-placeholder")).toHaveCount(0);
  await page.screenshot({ path: `${evidence}/reload-from-tab.png` });

  release();
  // Refreshed behind the page, and the map asks only for values: its outlines
  // were kept too.
  await expect
    .poll(() =>
      api.requests
        .slice(before)
        .filter((request) => /\/heat-outlook\/geo-ke\/.*map\?/.test(request)),
    )
    .not.toHaveLength(0);
  const maps = api.requests
    .slice(before)
    .filter((request) => /\/heat-outlook\/geo-ke\/.*map\?/.test(request));
  expect(maps.every((request) => request.includes("geometry=false"))).toBe(true);
  await expect
    .poll(() => api.requests.slice(before).some((r) => r.includes("/observed?")))
    .toBe(true);
  await expect(estimate).toHaveText(shown);
});

test("another user signing in on the tab never sees the last user's reads", async ({
  page,
}) => {
  const api = await installKenya(page);
  await page.goto("/dashboard/geo-ke?admin_unit=geo-ke-kajiado&outcome=lbw");
  const estimate = page.getByTestId("heat-outlook").getByTestId("outlook-estimate");
  await expect(estimate).toContainText("may be attributable to heat exposure.");
  await page.waitForTimeout(600);
  expect(
    await page.evaluate(() => sessionStorage.getItem("chart.query-cache.v1")),
  ).toContain('"userId":"e2e-user"');

  // Same tab, a different account; hold its reads to see what is drawn first.
  // A later page.route wins over the fake API's own /auth/me.
  await page.route("**/api/chart/auth/me", (route) =>
    json(route, {
      userId: "someone-else",
      username: "other",
      roles: ["health_planning_lead"],
      geographyScopes: ["/kenya"],
    }),
  );
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/chart/heat-outlook/**", async (route) => {
    await held;
    await route.fallback();
  });
  await page.reload();
  await expect(
    page.getByRole("navigation", { name: "Main" }).getByRole("link").first(),
  ).toBeVisible();
  await expect(estimate).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => sessionStorage.getItem("chart.query-cache.v1") ?? ""),
    )
    .not.toContain('"userId":"e2e-user"');
  release();
  await expect(estimate).toContainText("may be attributable to heat exposure.");
});

test("while the session is restored, the science video is already there", async ({
  page,
}) => {
  const api = await installKenya(page);
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  api.on(/^\/api\/auth\/keycloak-refresh$/, async (route) => {
    await held;
    return json(route, { access_token: accessToken });
  });
  await page.goto("/dashboard/geo-ke?admin_unit=geo-ke-kajiado&outcome=lbw");
  await expect(page.getByLabel("Loading dashboard")).toBeVisible();
  await expect(page.getByLabel("CHART explainer video")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Understanding the science" }),
  ).toHaveCSS("font-family", /Fira Sans/);
  await page.screenshot({ path: `${evidence}/restoring-video.png` });
  release();
  await expect(page.getByTestId("heat-outlook")).toBeVisible();
});
