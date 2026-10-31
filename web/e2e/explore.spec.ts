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
  // The map loads once, for the month shown - not first with a default.
  const mapReads = () =>
    api.requests.filter((item) => item.includes("/heat-outlook/geo-ke/observed/map"));
  await expect.poll(() => mapReads().length).toBe(1);
  expect(mapReads()[0]).toContain("month=2026-08");
  // Explore stands on its own: no Learning Hub detour.
  await expect(
    page.getByRole("link", { name: /Learning hub|How CHART works/i }),
  ).toHaveCount(0);

  // Months held for the year are offered; choosing one moves the estimate.
  const months = page.getByRole("group", { name: "Month" });
  await months.getByRole("button", { name: "Jun" }).click();
  await expect(estimate).toContainText("Jun 2026");
  await expect(page).toHaveURL(/month=2026-06/);
  await expect.poll(() => mapReads().length).toBe(2);
  // Going back to a month already seen answers from memory, no reload.
  await months.getByRole("button", { name: "Aug" }).click();
  await expect(estimate).toContainText("Aug 2026");
  expect(mapReads()).toHaveLength(2);

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

  // The search autocompletes as you type and Enter takes you there.
  const search = page.getByRole("combobox", { name: "Search places" });
  await search.fill("Kaji");
  await expect(page.getByRole("option").first()).toContainText("Kajiado");
  await expect(page.getByRole("option").first()).toContainText("County · Kenya");
  await search.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Kajiado" })).toBeVisible();
  await expect(page).toHaveURL(/frame=geo-ke&place=geo-ke-kajiado/);

  // The seasonal cycle is a line over the twelve months, season shaded.
  const cycle = page.getByTestId("explore-seasonal-cycle");
  await expect(cycle.locator("svg title")).toHaveCount(12);
  await expect(cycle.locator("[data-season-month]")).toHaveCount(4);
  await expect(cycle.locator("path")).toHaveCount(1);
  await expect(cycle).toContainText("Heat season");
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
  // Emissions read as Low / Medium / High, each with its SSP code.
  const scenarios = page.getByRole("group", { name: "Scenario" }).getByRole("button");
  await expect(scenarios).toHaveText(["LowSSP1-2.6", "MediumSSP3-7.0", "HighSSP5-8.5"]);
  await expect(page.getByTestId("explore-legend")).toContainText(
    "High emissions (SSP5-8.5)",
  );
  await scenarios.filter({ hasText: "Low" }).click();
  await expect(page).toHaveURL(/scenario=ssp126/);
  await expect(page.getByTestId("explore-projection")).toContainText(
    "low emissions (SSP1-2.6)",
  );
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
  // Switching layer keeps the month being viewed (Aug, from the observed layer).
  await expect(legend).toContainText("Aug 2026 · Copernicus ERA5-Land");
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

  // A shared link keeps its month.
  await page.goto("/explore?frame=geo-ke&outcome=lbw&layer=tmax&month=2026-08");
  await expect(legend).toContainText("Aug 2026 · Copernicus ERA5-Land");

  await legend.getByRole("button", { name: "See info" }).click();
  await expect(legend).toContainText("Context only");
  await page.getByRole("radio", { name: /^Heatwave days/ }).check();
  await expect(legend).toContainText("15+");
  await page.screenshot({
    path: "../outputs/e2e/web/explore-temperature.png",
    fullPage: true,
  });
});

test("search reaches the other country, and a place leads to its actions and plan", async ({
  page,
}) => {
  const { api } = await openExplore(page, "frame=geo-ke&outcome=lbw");
  api.on(/^\/api\/chart\/recommended-actions$/, (route) =>
    json(route, {
      items: [
        {
          slug: "cool-roofs",
          name: "Cool roofs for health facilities",
          description: "Reflective roofing keeps maternity wards cooler.",
          costOfImplementation: "low",
          taxonomies: [
            { type: "hazard", label: "Extreme heat" },
            { type: "solution_type", label: "Infrastructure" },
          ],
          links: [{ url: "https://www.who.int/cool-roofs", label: "who.int" }],
        },
        {
          slug: "flood-walls",
          name: "Flood walls",
          description: "Barriers against river floods.",
          costOfImplementation: "high",
          taxonomies: [{ type: "hazard", label: "Floods" }],
          links: [],
        },
      ],
      total: 2,
    }),
  );
  await page.reload();

  // An empty search lists the areas of the place being viewed.
  const search = page.getByRole("combobox", { name: "Search places" });
  await search.focus();
  await expect(page.getByRole("listbox")).toContainText("Areas in Kenya");
  await expect(page.getByRole("option", { name: /Kajiado/ })).toBeVisible();
  // Typing reaches India too; picking it moves the whole view there.
  await search.fill("bhop");
  await page.getByRole("option", { name: /Bhopal Division/ }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Bhopal Division" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/frame=geo-in-mp&place=geo-in-mp-bhopal/);
  await expect(
    page.getByRole("group", { name: "Country" }).getByRole("button", { name: "India" }),
  ).toHaveAttribute("aria-pressed", "true");

  const act = page.getByTestId("explore-act");
  await expect(act).toContainText("1 actions in the repository reduce heat risk");
  await expect(
    act.getByRole("link", { name: /Plan for Bhopal Division/ }),
  ).toHaveAttribute(
    "href",
    /^\/dashboard\/geo-in-mp\?admin_unit=geo-in-mp-bhopal&outcome=lbw/,
  );
  await act.getByRole("button", { name: "See actions" }).click();
  const drawer = page.getByRole("complementary", { name: "Action repository" });
  await expect(drawer).toContainText("1 of 2 actions");
  await drawer.getByRole("button", { name: /Cool roofs/ }).click();
  await expect(drawer).toContainText("maternity wards");
  await expect(drawer.getByRole("link", { name: "who.int" })).toHaveAttribute(
    "href",
    "https://www.who.int/cool-roofs",
  );
  await drawer.getByRole("button", { name: "All hazards" }).click();
  await expect(drawer).toContainText("2 of 2 actions");
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);

  // Signing in from here returns to this place's planning dashboard.
  await page.route("**/auth/signin", (route) =>
    route.fulfill({ contentType: "text/html", body: "<p>Keycloak</p>" }),
  );
  await page.getByRole("link", { name: "Sign in to plan" }).click();
  await expect(page).toHaveURL(/\/auth\/signin$/);
  const remembered = await page.evaluate(() =>
    window.sessionStorage.getItem("chart.auth.returnTo"),
  );
  expect(remembered).toMatch(/^\/dashboard\/geo-in-mp\?admin_unit=geo-in-mp-bhopal/);
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
