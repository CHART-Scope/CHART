import { expect, test, type Page } from "@playwright/test";

import { json } from "./support/fakeApi";
import { fixtures, installKenya } from "./support/kenya";

// The public Explore view: no sign-in, every request anonymous, the map
// shaded from published estimates, and a place's estimate, seasonal cycle
// and projected change in the side panel. Responses are the real Python
// service's Kenya output (support/kenya.ts). The basemap host is blocked so
// the map must still draw its areas on the plain fallback style.

async function openExplore(page: Page, query: string) {
  const authorized: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/chart/") && request.headers()["authorization"])
      authorized.push(request.url());
  });
  await page.route("https://tiles.openfreemap.org/**", (route) => route.abort());
  const api = await installKenya(page);
  await page.goto(`/explore?${query}`);
  return { api, authorized };
}

test("a visitor explores Kenya's observed months without signing in", async ({
  page,
}) => {
  const { api, authorized } = await openExplore(page, "frame=geo-ke&outcome=lbw");

  await expect(page).toHaveURL(/\/explore\?/);
  await expect(page.getByRole("heading", { level: 1, name: "Kenya" })).toBeVisible();
  const estimate = page.getByTestId("explore-estimate");
  await expect(estimate).toContainText("Aug 2026");
  await expect(estimate).toContainText("14.7%");
  await expect(estimate).toContainText("odds ratio 1.19");
  await expect(
    page.getByText(
      /Hot season: Dec–Mar, peak in Feb \(Kenya Meteorological Department\)/,
    ),
  ).toBeVisible();
  await expect(page.getByTestId("explore-legend")).toContainText("Observed heat share");
  await expect(page.getByTestId("explore-map").locator("canvas")).toBeVisible();
  await expect
    .poll(() =>
      api.requests.some((item) => item.includes("/heat-outlook/geo-ke/observed/map")),
    )
    .toBe(true);

  // Months held for the year are offered; choosing one moves the estimate.
  await page
    .getByRole("group", { name: "Month" })
    .getByRole("button", { name: "Jun" })
    .click();
  await expect(estimate).toContainText("Jun 2026");
  await expect(page).toHaveURL(/month=2026-06/);

  expect(authorized).toEqual([]);
  await page.screenshot({
    path: "../outputs/e2e/web/explore-observed.png",
    fullPage: true,
  });
});

test("selecting a county shows its seasonal cycle and projected change", async ({
  page,
}) => {
  const { authorized } = await openExplore(page, "frame=geo-ke&outcome=lbw");

  await page.getByRole("searchbox", { name: "Search places" }).fill("Kaji");
  await page.getByRole("button", { name: /Kajiado/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Kajiado" })).toBeVisible();
  await expect(page).toHaveURL(/place=geo-ke-kajiado/);

  const cycle = page.getByTestId("explore-seasonal-cycle");
  await expect(cycle.locator("[title]")).toHaveCount(12);
  // The official season (Dec-Mar) is marked on the cycle.
  await expect(cycle.locator("[data-season]")).toHaveCount(4);
  const projection = page.getByTestId("explore-projection");
  // The baseline and the non-overlapping 20-year periods, not every window.
  await expect(projection.getByRole("listitem")).toHaveCount(5);

  await page.getByRole("radio", { name: /Projected heat share/ }).check();
  await expect(page.getByRole("group", { name: "Period", exact: true })).toBeVisible();
  await page
    .getByRole("group", { name: "Period", exact: true })
    .getByRole("button", { name: "2061–2080" })
    .click();
  await expect(page).toHaveURL(/period=2061-2080/);
  await expect(page.getByTestId("explore-legend")).toContainText("2061–2080");
  // High projected shares keep their own classes instead of one ">15%".
  await expect(page.getByTestId("explore-legend")).toContainText("30–35%");
  await expect(page.getByTestId("explore-legend")).toContainText(">35%");
  // Shorter periods are a choice, still without overlapping windows.
  await page
    .getByRole("group", { name: "Period length" })
    .getByRole("button", { name: "10 years" })
    .click();
  await expect(
    page.getByRole("group", { name: "Period", exact: true }).getByRole("button"),
  ).toHaveText(["1981–2010", "2011–2020"]);

  expect(authorized).toEqual([]);
  await page.screenshot({
    path: "../outputs/e2e/web/explore-projection.png",
    fullPage: true,
  });
});

test("ERA5-Land temperature and heatwave days are context layers by month", async ({
  page,
}) => {
  const { api } = await openExplore(page, "frame=geo-ke&outcome=lbw");
  api.on(/^\/api\/chart\/heat-outlook\/geo-ke\/climate$/, (route, url) => {
    const layer = url.searchParams.get("layer");
    const month = url.searchParams.get("month") ?? "2026-09";
    return json(route, {
      ...fixtures.mapFrame,
      outcome: "lbw",
      month,
      metric: `climate_${layer}`,
      unit: layer === "tmax" ? "degC" : "days",
      available_months: ["2026-07", "2026-08", "2026-09"],
      source: "Copernicus ERA5-Land (0.1°), area mean of daily maxima",
      areas: fixtures.mapFrame.areas.map((area, index) => ({
        ...area,
        value_percent: layer === "tmax" ? 28 + (index % 12) : index % 9,
        missing_reason: null,
      })),
    });
  });

  await page.getByRole("radio", { name: /^Temperature/ }).check();
  const legend = page.getByTestId("explore-legend");
  await expect(legend).toContainText("Temperature");
  await expect(legend).toContainText("33–36°");
  await expect(legend).toContainText("Sep 2026 · Copernicus ERA5-Land");
  await expect(page).toHaveURL(/layer=tmax/);
  // Its own months: the three ERA5-Land months, not the observed estimates'.
  const monthGroup = page.getByRole("group", { name: "Month" });
  await expect(monthGroup.getByRole("button", { name: "Sep" })).toBeEnabled();
  await expect(monthGroup.getByRole("button", { name: "Jun" })).toBeDisabled();
  await monthGroup.getByRole("button", { name: "Jul" }).click();
  await expect(legend).toContainText("Jul 2026");
  await expect
    .poll(() => api.requests.some((item) => item.includes("layer=tmax&month=2026-07")))
    .toBe(true);

  await legend.getByRole("button", { name: "See info" }).click();
  await expect(legend).toContainText("Context only");
  await page.getByRole("radio", { name: /^Heatwave days/ }).check();
  await expect(legend).toContainText("15+");
  await page.screenshot({
    path: "../outputs/e2e/web/explore-temperature.png",
    fullPage: true,
  });
});

test("a missing layer says so instead of an empty map", async ({ page }) => {
  await openExplore(page, "frame=geo-ke&outcome=lbw&layer=vulnerability");
  await expect(
    page.getByRole("status").filter({ hasText: "No vulnerability assessment" }),
  ).toBeVisible();
});

test("Explore fits a phone screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 860 });
  await openExplore(page, "frame=geo-ke&outcome=lbw");
  await expect(page.getByTestId("explore-estimate")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  await page.screenshot({
    path: "../outputs/e2e/web/explore-phone.png",
    fullPage: true,
  });
});
