import { expect, test, type Page } from "@playwright/test";

import { json } from "./support/fakeApi";
import { fixtures, installKenya, type KenyaApi } from "./support/kenya";

// The risk overview (design frames 08a–08c): Observed, Forecasted and
// Projected are one panel whose controls, figures and map trade places
// without the layout moving.

const months = ["2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04"];
const panel = (page: Page) => page.getByTestId("heat-outlook");

/** The C3S forecast for Kajiado, as the forecast API serves it. */
function serveForecast(api: KenyaApi) {
  api.on(/^\/api\/chart\/heat-outlook\/geo-ke\/forecast\/map$/, (route, url) => {
    const month = url.searchParams.get("month") ?? months[0];
    return json(route, {
      ...fixtures.mapFrame,
      outcome: "lbw",
      month,
      metric: "heat_attributable_share_forecast_month",
      issue: "2026-11",
      months,
      ranges: {},
      tmax_c: {},
      areas: fixtures.mapFrame.areas.map((area) => ({
        ...area,
        value_percent: month === "2026-12" ? 21 : 9,
        missing_reason: null,
      })),
    });
  });
  api.on(/^\/api\/chart\/heat-outlook\/geo-ke-kajiado\/forecast$/, (route) =>
    json(route, {
      geography_id: "geo-ke-kajiado",
      outcome: "lbw",
      issue: "2026-11",
      selector: "P",
      selectors: ["P"],
      systems: ["ecmwf 51", "ukmo 610"],
      source: "Copernicus C3S multi-system seasonal forecast",
      source_uri: "https://cds.climate.copernicus.eu",
      method: "normal plus anomaly",
      months: months.map((month, index) => ({
        month,
        tmax_c: 28 + index,
        tmax_low_c: 27 + index,
        tmax_high_c: 29 + index,
        value_percent: 12 + index,
        low_percent: 10 + index,
        high_percent: 14 + index,
        ratio: {
          kind: "odds_ratio",
          value: 1.2,
          low: index === 0 ? 1.05 : 0.6,
          high: index === 0 ? 1.4 : 4.5,
          precision: index === 0 ? "high" : "moderate",
        },
      })),
    }),
  );
  // Garissa has no forecast saved.
  api.on(/^\/api\/chart\/heat-outlook\/geo-ke-garissa\/forecast$/, (route) =>
    json(route, { detail: "FORECAST_NOT_AVAILABLE" }, 404),
  );
}

test("the three tabs swap figures and map in place; the forecast follows its month", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const api = await installKenya(page);
  serveForecast(api);
  await page.goto("/dashboard/geo-ke?admin_unit=geo-ke-kajiado&outcome=lbw");

  const outlook = panel(page);
  const tabs = outlook.getByRole("tab");
  await expect(tabs).toHaveText(["Observed", "Forecasted", "Projected"]);
  await expect(outlook.getByRole("tab", { name: "Observed" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const estimate = outlook.getByTestId("outlook-estimate");
  await expect(estimate).toContainText("may be attributable to heat exposure.");
  await expect(outlook.getByText("No data yet")).toBeVisible();
  // The forecast is only asked for once its tab opens.
  expect(api.requests.some((request) => request.includes("/forecast"))).toBe(false);
  const map = outlook.locator('svg[role="group"]');
  await expect(map).toHaveCount(1);
  const observedMap = await map.boundingBox();
  const observedFigures = await outlook
    .getByRole("img", { name: /of 100/ })
    .boundingBox();

  await outlook.getByRole("tab", { name: "Forecasted" }).click();
  await expect(page).toHaveURL(/view=forecast/);
  await expect(estimate).toContainText(
    "At a forecasted maximum temperature of 28.0 °C in Nov 2026, 12.0% of low birth weight cases in Kajiado County may be attributable to heat exposure.",
  );
  await expect(estimate).toContainText("Forecast-system range 10.0 to 14.0%");
  await expect(estimate.getByRole("button", { name: /High/ })).toBeVisible();
  await expect(outlook.getByTestId("outlook-source")).toContainText(
    "Copernicus C3S multi-system seasonal forecast, issued Nov 2026",
  );
  await expect(
    outlook.getByText(
      "Forecasts are available for the next 6 months (Nov 2026 – Apr 2027).",
    ),
  ).toBeVisible();
  await expect(outlook.getByText("Outside forecast window")).toBeVisible();
  // A month outside the six is shown but cannot be picked.
  const october = outlook.locator("#forecast-month-2026-10");
  await expect(october).toBeDisabled();
  await expect(october).toHaveAttribute("title", "Outside the forecast window");
  // Saved plans hold observed or projected views only.
  await expect(outlook.getByRole("button", { name: "Save plan" })).toBeDisabled();
  // Same panel, same columns: the map is not remounted or moved sideways.
  await expect(outlook.locator("#heat-outlook-title")).toContainText("Kajiado County");
  await expect(map).toHaveCount(1);
  const forecastMap = await map.boundingBox();
  expect(Math.abs(forecastMap!.x - observedMap!.x)).toBeLessThan(4);
  expect(Math.abs(forecastMap!.width - observedMap!.width)).toBeLessThan(8);
  const forecastFigures = await outlook
    .getByRole("img", { name: /of 100/ })
    .boundingBox();
  expect(Math.abs(forecastFigures!.x - observedFigures!.x)).toBeLessThan(1);

  await outlook.locator("#forecast-month-2026-12").click();
  await expect(page).toHaveURL(/forecast_month=2026-12/);
  await expect(estimate).toContainText("in Dec 2026, 13.0% of low birth weight cases");
  await expect(estimate.getByRole("button", { name: /Moderate/ })).toBeVisible();
  await expect(
    outlook.getByRole("img", { name: "13 of 100 newborn figures highlighted" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      api.requests.some((request) =>
        /geo-ke\/forecast\/map\?.*month=2026-12/.test(request),
      ),
    )
    .toBe(true);
  await page.waitForTimeout(400);
  await page.screenshot({
    path: "../outputs/e2e/web/risk-overview-forecast.png",
    fullPage: true,
  });

  // The forecast month survives a reload.
  await page.reload();
  await expect(estimate).toContainText("in Dec 2026, 13.0%");

  // A county without a forecast keeps the tab and says so.
  await outlook.getByRole("button", { name: /^Garissa: / }).click();
  await page.waitForURL(/admin_unit=geo-ke-garissa/);
  await expect(outlook.getByRole("status")).toContainText(
    "No seasonal forecast is available for this place yet.",
  );
  await expect(outlook.getByRole("tab", { name: "Forecasted" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(api.unhandled).toEqual([]);
});

test("projected: time horizon, emission scenario cards and reference period", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const api = await installKenya(page);
  await page.goto(
    "/dashboard/geo-ke?admin_unit=geo-ke-kajiado&outcome=lbw&view=projection",
  );

  const outlook = panel(page);
  const labels = outlook.locator("[class*='controlLabel']");
  // Only the whole pregnancy is on in Settings, so it has no row.
  await expect(outlook.getByRole("combobox", { name: "Pregnancy window" })).toHaveCount(
    0,
  );
  await expect(labels).toContainText([
    "Time horizon",
    "Emission scenario",
    "Reference period",
  ]);
  const scenarios = outlook.getByRole("group", { name: "Emission scenario" });
  await expect(scenarios.getByRole("button")).toHaveText([
    "Low emissionsSSP1-2.6",
    "Medium-high emissionsSSP3-7.0",
    "High emissionsSSP5-8.5",
  ]);
  // The published scenario is pressed; picking another asks for it (the
  // Kenya fixture answers every scenario with the published one).
  await expect(
    scenarios.getByRole("button", { name: "High emissions SSP5-8.5" }),
  ).toHaveAttribute("aria-pressed", "true");
  await scenarios.getByRole("button", { name: "Low emissions SSP1-2.6" }).click();
  await expect(page).toHaveURL(/scenario=ssp126/);
  await expect
    .poll(() => api.requests.some((request) => request.includes("scenario=ssp126")))
    .toBe(true);
  await expect(outlook.getByTestId("outlook-estimate")).toContainText(
    "At a projected average annual maximum temperature of",
  );
  await page.waitForTimeout(400);
  await page.screenshot({
    path: "../outputs/e2e/web/risk-overview-projected.png",
    fullPage: true,
  });
  expect(api.unhandled).toEqual([]);
});

test("filter bar: labelled dropdowns, health domain, and Configure plan opens the actions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const api = await installKenya(page);
  // The actions page reads the place's heat-season calendar for its Gantt.
  api.on(/^\/api\/chart\/heat-seasons\/geo-ke-kajiado$/, (route) =>
    json(route, {
      geography_id: "geo-ke-kajiado",
      name: "Kajiado",
      level_label: "County",
      parent_id: "geo-ke",
      depth: 1,
      own: null,
      months: "dddaaaabbbbd",
      state: "official",
      inherited_from: null,
      source: "Kenya Meteorological Department",
    }),
  );
  await page.goto("/dashboard/geo-ke?admin_unit=geo-ke-kajiado&outcome=lbw");

  const bar = page.getByRole("group", { name: "Dashboard context" });
  for (const name of ["County", "Climate hazard", "Health domain", "Health outcome"])
    await expect(bar.getByRole("combobox", { name, exact: true })).toBeVisible();
  const domain = bar.getByRole("combobox", { name: "Health domain", exact: true });
  await expect(domain).toContainText("Maternal and child health");
  await domain.click();
  await expect(
    page.getByRole("option", { name: "Vector borne diseases (coming soon)" }),
  ).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Escape");

  // Recommended actions: three season columns, each card tagged with its
  // department and status.
  const actions = page.getByRole("region", { name: "Before heat season" });
  await expect(
    actions.getByRole("heading", { name: "Before heat season" }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "During heat season" })).toBeVisible();
  await expect(page.getByRole("region", { name: "After heat season" })).toBeVisible();
  await expect(actions.getByRole("button").first()).toContainText("Not started");

  await bar.getByRole("link", { name: "Configure plan" }).click();
  await page.waitForURL(/\/dashboard\/geo-ke\/actions\?/);
  const url = new URL(page.url());
  expect(url.searchParams.get("outcome")).toBe("lbw");
  expect(url.searchParams.get("admin_unit")).toBe("geo-ke-kajiado");
  const view = page.getByRole("group", { name: "View" });
  await expect(view.getByRole("button", { name: "List" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await view.getByRole("button", { name: "Gantt chart" }).click();
  await expect(page).toHaveURL(/view=gantt/);
  await page.screenshot({
    path: "../outputs/e2e/web/risk-overview-actions-gantt.png",
    fullPage: true,
  });
  expect(api.unhandled).toEqual([]);
});
