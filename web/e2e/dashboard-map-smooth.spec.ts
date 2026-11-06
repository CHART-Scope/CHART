import { expect, test } from "@playwright/test";

import { geographies, installFakeApi, json } from "./support/fakeApi";

// Two districts under Gwalior, so opening Gwalior is a drill to a new place.
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

async function openState(page: import("@playwright/test").Page) {
  const api = await installFakeApi(page);
  api.on(/^\/api\/chart\/geographies$/, (route) => json(route, withDistricts));
  await page.goto("/dashboard/geo-in-mp?outcome=lbw&month=2026-08");
  await expect(page.locator("svg path[data-interactive]").first()).toBeVisible();
  return api;
}

test("resting on an area fetches the map it opens, before the click", async ({
  page,
}) => {
  const requested: string[] = [];
  page.on("request", (request) => requested.push(new URL(request.url()).pathname));
  await openState(page);
  expect(requested).not.toContain("/api/chart/risk/geo-in-mp-gwalior/map");

  await page
    .getByRole("button", { name: /^Gwalior/ })
    .first()
    .hover();
  await expect
    .poll(() => requested.includes("/api/chart/risk/geo-in-mp-gwalior/map"))
    .toBe(true);
});

test("opening a place not loaded yet keeps the last map, never a blank", async ({
  page,
}) => {
  await openState(page);
  // Hold Gwalior's map until checked; the newest route answers first.
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/chart/risk/geo-in-mp-gwalior/map**", async (route) => {
    await held;
    await route.fallback();
  });

  await page
    .getByRole("button", { name: /^Gwalior/ })
    .first()
    .click();
  await page.waitForURL(/\/dashboard\/geo-in-mp-gwalior/);
  // While Gwalior loads, the state's map stays drawn (dimmed), not the skeleton.
  await expect(page.getByLabel("Loading the risk map")).toHaveCount(0);
  await expect(page.locator("svg path[data-interactive]").first()).toBeVisible();
  await page.screenshot({ path: "../outputs/e2e/web/dashboard-drill-held.png" });

  release();
  await expect(page.locator("svg path[data-interactive]").first()).toBeVisible();
  await expect(page.getByLabel("Loading the risk map")).toHaveCount(0);
});

test("a click never empties the risk card while the next place loads", async ({
  page,
}) => {
  await openState(page);
  await expect(page.getByText(/What share of/).first()).toBeVisible();
  // Hold Gwalior's capabilities (which views it publishes) until checked.
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(
    "**/api/chart/heat-outlook/geo-in-mp-gwalior/capabilities**",
    async (route) => {
      await held;
      await route.fallback();
    },
  );

  await page
    .getByRole("button", { name: /^Gwalior/ })
    .first()
    .click();
  await page.waitForURL(/\/dashboard\/geo-in-mp-gwalior/);
  // The card keeps its question and map instead of an empty placeholder.
  await expect(page.getByTestId("dashboard-panel-placeholder")).toHaveCount(0);
  await expect(page.getByText(/What share of/).first()).toBeVisible();
  await expect(page.locator("svg path[data-interactive]").first()).toBeVisible();

  release();
  await expect(page.getByText(/What share of/).first()).toBeVisible();
});
