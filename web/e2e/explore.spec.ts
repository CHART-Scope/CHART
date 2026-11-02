import { expect, test, type Page } from "@playwright/test";

import { json } from "./support/fakeApi";
import { fixtures, installKenya, observedFixtures } from "./support/kenya";

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
  await expect(estimate).toContainText("Odds ratio 1.19");
  // Three times, as tabs; Observed is the one open.
  const tabs = page.getByRole("tablist", { name: "Time" }).getByRole("tab");
  await expect(tabs).toHaveText(["Observed", "Next 6 months", "Projections"]);
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
  // Beside the figure, how firm it is: the dashboard's precision, in bars.
  const precision = estimate.getByRole("img", { name: /precision/ });
  await expect(precision).toHaveAttribute(
    "aria-label",
    "High precision: the 95% interval of the odds ratio is 1.02–1.35",
  );
  await expect(precision.locator("i[data-on]")).toHaveCount(3);
  // Green for high precision (the design system's success colour).
  await expect(precision.locator("i[data-on]").first()).toHaveCSS(
    "background-color",
    "rgb(62, 174, 80)",
  );
  await expect(
    page.getByText(
      /Hot season: Dec–Mar, peak in Feb \(Kenya Meteorological Department\)/,
    ),
  ).toBeVisible();
  // The season names its source, and links to it.
  await expect(
    page.getByRole("link", { name: "Kenya Meteorological Department" }),
  ).toHaveAttribute("href", /^https:\/\//);
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
  // The figure at the top follows, its precision with it.
  await expect(precision).toHaveAttribute(
    "aria-label",
    "High precision: the 95% interval of the odds ratio is 1.03–1.33",
  );
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

  // On the historical layer the cycle is the selected year's observed
  // months against the average year: May-Sep 2026 average 19.1%.
  const cycle = page.getByTestId("explore-seasonal-cycle");
  await expect(cycle).toContainText("Seasonal cycle, 2026");
  await expect(cycle.locator("svg title")).toHaveCount(12);
  await expect(cycle.locator("[data-season-month]")).toHaveCount(4);
  await expect(cycle.locator("path")).toHaveCount(2);
  await expect(page.getByTestId("explore-year-average")).toContainText(
    "Year average: 19.1%",
  );
  // Past months show no projection controls or periods.
  await expect(page.getByTestId("explore-projection")).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Period", exact: true })).toHaveCount(0);

  await page.getByRole("tab", { name: "Projections" }).click();
  await expect(page.getByRole("group", { name: "Period", exact: true })).toBeVisible();
  // Past months and their pickers give way.
  await expect(page.getByRole("group", { name: "Month", exact: true })).toHaveCount(0);
  // The figure at the top is now the period's, with its precision.
  await expect(page.getByTestId("explore-estimate")).toContainText("2041–2060");
  await expect(
    page.getByTestId("explore-estimate").getByRole("img", { name: /precision/ }),
  ).toHaveCount(1);
  const projection = page.getByTestId("explore-projection");
  // The baseline and the non-overlapping 20-year periods, not every window.
  await expect(projection.getByRole("listitem")).toHaveCount(5);
  // Projections show the period's typical year instead, season shaded.
  await expect(cycle).not.toContainText("observed");
  await expect(cycle.locator("path")).toHaveCount(1);
  await expect(cycle).toContainText("Heat season");
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
  // Drilling back up keeps every setting, and moves the map out.
  const before = new URL(page.url()).searchParams;
  await page.getByRole("button", { name: "↑ All of Kenya" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Kenya" })).toBeVisible();
  await expect(page).not.toHaveURL(/place=/);
  const after = new URL(page.url()).searchParams;
  for (const key of ["outcome", "view", "period", "scenario", "length"])
    expect(after.get(key)).toBe(before.get(key));
  // A country has nothing above it.
  await expect(page.getByRole("button", { name: /^↑/ })).toHaveCount(0);
  // The browser's Back returns to the county; Forward goes up again.
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1, name: "Kajiado" })).toBeVisible();
  await expect(page).toHaveURL(/place=geo-ke-kajiado/);
  await expect(page.getByRole("tab", { name: "Projections" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.goForward();
  await expect(page.getByRole("heading", { level: 1, name: "Kenya" })).toBeVisible();

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

  const shows = page.getByRole("group", { name: "Map shows" });
  await shows.getByRole("button", { name: "Temperature" }).click();
  const legend = page.getByTestId("explore-legend");
  await expect(legend).toContainText("Temperature");
  await expect(legend).toContainText("33–36°");
  // Switching layer keeps the month being viewed (Aug, from the observed layer).
  await expect(legend).toContainText("Aug 2026 · Copernicus ERA5-Land");
  await expect(page).toHaveURL(/map=tmax/);
  // Its own months: the three ERA5-Land months, not the observed estimates'.
  const monthGroup = page.getByRole("group", { name: "Month" });
  await expect(monthGroup.getByRole("button", { name: "Sep" })).toBeEnabled();
  await expect(monthGroup.getByRole("button", { name: "Jun" })).toBeDisabled();
  await monthGroup.getByRole("button", { name: "Jul" }).click();
  await expect(legend).toContainText("Jul 2026");
  await expect
    .poll(() => api.requests.some((item) => item.includes("layer=tmax&month=2026-07")))
    .toBe(true);

  // A shared link keeps its month (old links with "layer" too).
  await page.goto("/explore?frame=geo-ke&outcome=lbw&layer=tmax&month=2026-08");
  await expect(legend).toContainText("Aug 2026 · Copernicus ERA5-Land");

  await legend.getByRole("button", { name: "See info" }).click();
  await expect(legend).toContainText("Context only");
  await shows.getByRole("button", { name: "Heatwave days" }).click();
  await expect(legend).toContainText("15+");
  // The thresholds' official source, linked.
  await expect(
    legend.getByRole("link", { name: "Kenya Meteorological Department" }),
  ).toHaveAttribute("href", /^https:\/\//);
  // Temperature and heatwave days are past months: other times shade the heat share.
  await page.getByRole("tab", { name: "Next 6 months" }).click();
  await expect(shows.getByRole("button")).toHaveText(["Heat share", "Population"]);
  await page.getByRole("tab", { name: "Observed" }).click();
  await expect(shows.getByRole("button", { name: "Heatwave days" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
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

  // Regression: a list opening under a resting pointer highlighted the row
  // under it, so Enter picked that row instead of the best match.
  const search0 = page.getByRole("combobox", { name: "Search places" });
  const box = await search0.boundingBox();
  if (!box) throw new Error("search box not laid out");
  await page.mouse.move(box.x + 40, box.y + box.height + 60);
  await search0.fill("a");
  const best = (
    await page.getByRole("option").first().locator("span").innerText()
  ).trim();
  await expect(page.getByRole("option")).not.toHaveCount(1);
  await search0.press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(best);

  // An empty search lists the areas of the place being viewed.
  const search = page.getByRole("combobox", { name: "Search places" });
  await search.focus();
  // (The pick above was India, so its areas are listed.)
  await expect(page.getByRole("listbox")).toContainText(`Areas in ${best}`);
  await expect(page.getByRole("option", { name: /Madhya Pradesh/ })).toBeVisible();
  // Typing reaches India too; picking it moves the whole view there.
  await search.fill("bhop");
  await page.getByRole("option", { name: /Bhopal Division/ }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Bhopal Division" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/frame=geo-in-mp&place=geo-in-mp-bhopal/);
  // Up from a selection, then up a level: the state outlined in India.
  await page.getByRole("button", { name: "↑ All of Madhya Pradesh" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Madhya Pradesh" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "↑ Up to India" }).click();
  await expect(page).toHaveURL(/frame=geo-in&place=geo-in-mp/);
  await page.goBack();
  await page.goBack();
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

test("population shows density on the map and counts for the place", async ({
  page,
}) => {
  const { api } = await openExplore(
    page,
    "frame=geo-ke&place=geo-ke-kajiado&outcome=lbw",
  );
  api.on(/^\/api\/chart\/heat-outlook\/geo-ke\/population$/, (route, url) => {
    const measure = url.searchParams.get("measure") ?? "total";
    const count = (index: number) => ({
      total: 1_000_000 + index * 10_000,
      under5: 130_000 + index * 1_000,
      women_15_49: 250_000 + index * 2_000,
      area_km2: 5_000,
    });
    const counts = Object.fromEntries(
      fixtures.mapFrame.areas.map((area, index) => [area.geography_id, count(index)]),
    );
    return json(route, {
      ...fixtures.mapFrame,
      outcome: "lbw",
      metric: `population_density_${measure}`,
      unit: "people_per_km2",
      measure,
      measure_label: measure,
      place: {
        total: 57_000_000,
        under5: 7_400_000,
        women_15_49: 14_000_000,
        area_km2: 580_000,
      },
      counts,
      areas: fixtures.mapFrame.areas.map((area, index) => ({
        ...area,
        value_percent:
          (measure === "under5" ? count(index).under5 : count(index).total) / 5_000,
        missing_reason: null,
      })),
      source: "WorldPop Global2 R2025A, constrained, UN adjusted, 1 km",
      source_uri: "https://hub.worldpop.org/project/categories?id=3",
      license: "CC BY 4.0",
      citation: "Bondarenko M. et al. (2025).",
      year: 2025,
    });
  });
  await page.reload();

  // Whatever the layer, the place's people are in the panel, with the source.
  const people = page.getByTestId("explore-people");
  const kajiado = fixtures.mapFrame.areas.findIndex(
    (area) => area.geography_id === "geo-ke-kajiado",
  );
  await expect(people).toContainText("People (2025)");
  // Counts are short (1.0M, 132k) so long ones still fit; the exact count is
  // on hover. Labels keep to one line, so the four figures share a row.
  const total = 1_000_000 + kajiado * 10_000;
  const everyone = people.locator("dd").first();
  await expect(everyone).toHaveText(`${(total / 1e6).toFixed(1)}M`);
  await expect(everyone).toHaveAttribute("title", total.toLocaleString());
  const figureTops = await people
    .locator("dd")
    .evaluateAll((items) =>
      items.map((item) => Math.round(item.getBoundingClientRect().top)),
    );
  expect(figureTops).toHaveLength(4);
  expect(new Set(figureTops).size).toBe(1);
  const fits = await people
    .locator("dl")
    .evaluate((list) => list.scrollWidth <= list.clientWidth + 1);
  expect(fits).toBe(true);
  await people.screenshot({ path: "../outputs/e2e/web/explore-people.png" });
  await expect(people.getByRole("link", { name: "WorldPop" })).toHaveAttribute(
    "href",
    "https://hub.worldpop.org/project/categories?id=3",
  );

  // The hover card: the outcome's figure beside the estimate, and the
  // area's children and women with the design team's icons.
  const map = page.getByTestId("explore-map");
  const box = await map.boundingBox();
  if (!box) throw new Error("map not laid out");
  // Selected Kajiado fills the view, so the middle of the map is Kajiado.
  await page.waitForTimeout(800);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const hover = page.getByTestId("explore-hover");
  await expect(hover).toContainText("Kajiado");
  await expect(hover).toContainText("of low-birth-weight births");
  await expect(hover).toContainText("under five");
  await expect(hover).toContainText("women 15–49");
  await expect(hover).toContainText("WorldPop 2025");
  await expect(hover.locator("use")).toHaveCount(3);
  // Kajiado has no areas beneath it here, so no double-click is offered.
  await expect(hover).not.toContainText("double-click");
  await page.screenshot({ path: "../outputs/e2e/web/explore-hover.png" });
  await page.mouse.move(box.x + 5, box.y + 5);

  await page
    .getByRole("group", { name: "Map shows" })
    .getByRole("button", { name: "Population" })
    .click();
  const legend = page.getByTestId("explore-legend");
  // The estimate at the top stays whatever the map shows.
  await expect(page.getByTestId("explore-estimate")).toContainText("%");
  await expect(legend).toContainText("Population");
  await expect(legend.getByRole("link", { name: "WorldPop 2025" })).toHaveAttribute(
    "href",
    "https://hub.worldpop.org/project/categories?id=3",
  );
  await expect(legend).toContainText("1.5k–5k");
  await page
    .getByRole("group", { name: "People" })
    .getByRole("button", { name: "Under five" })
    .click();
  await expect(page).toHaveURL(/map=population.*people=under5/);
  // The count sits apart from the map choice above it, not on top of it.
  const showsBox = (await page
    .getByRole("group", { name: "Map shows" })
    .boundingBox())!;
  const peopleBox = (await page.getByRole("group", { name: "People" }).boundingBox())!;
  expect(peopleBox.y - (showsBox.y + showsBox.height)).toBeGreaterThanOrEqual(6);
  await page
    .getByRole("group", { name: "Map shows" })
    .locator("xpath=..")
    .screenshot({ path: "../outputs/e2e/web/explore-map-shows.png" });
  await expect
    .poll(() => api.requests.some((item) => item.includes("population?measure=under5")))
    .toBe(true);
  // Under-five classes are scaled to the group, not everyone's.
  await expect(legend).not.toContainText("1.5k–5k");
  await page.screenshot({
    path: "../outputs/e2e/web/explore-population.png",
    fullPage: true,
  });
});

test("the next six months: forecast map, months and the place's range", async ({
  page,
}) => {
  const { api } = await openExplore(
    page,
    "frame=geo-ke&place=geo-ke-kajiado&outcome=lbw",
  );
  const months = ["2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"];
  api.on(/^\/api\/chart\/heat-outlook\/geo-ke\/forecast\/map$/, (route, url) => {
    const month = url.searchParams.get("month") ?? months[0];
    return json(route, {
      ...fixtures.mapFrame,
      outcome: "lbw",
      month,
      metric: "heat_attributable_share_forecast_month",
      issue: "2026-10",
      months,
      ranges: Object.fromEntries(
        fixtures.mapFrame.areas.map((area) => [area.geography_id, [8, 16]]),
      ),
      tmax_c: Object.fromEntries(
        fixtures.mapFrame.areas.map((area) => [area.geography_id, 29.4]),
      ),
      areas: fixtures.mapFrame.areas.map((area, index) => ({
        ...area,
        value_percent: month === "2026-11" ? 20 : 10 + (index % 5),
        missing_reason: null,
      })),
    });
  });
  api.on(/^\/api\/chart\/heat-outlook\/geo-ke-kajiado\/forecast$/, (route) =>
    json(route, {
      geography_id: "geo-ke-kajiado",
      outcome: "lbw",
      issue: "2026-10",
      selector: "P",
      selectors: ["P"],
      systems: ["ecmwf 51", "ukmo 610", "dwd 22"],
      source: "Copernicus C3S multi-system seasonal forecast",
      source_uri:
        "https://cds.climate.copernicus.eu/datasets/seasonal-postprocessed-single-levels",
      method: "normal plus anomaly",
      months: months.map((month, index) => ({
        month,
        tmax_c: 28 + index / 2,
        tmax_low_c: 27.5 + index / 2,
        tmax_high_c: 28.6 + index / 2,
        value_percent: 12 + index,
        low_percent: 9 + index,
        high_percent: 15 + index,
        // The model's own interval: firm in October, wide in November.
        ratio:
          index < 2
            ? {
                kind: "odds_ratio",
                value: 1.2,
                low: index === 0 ? 1.05 : 0.6,
                high: index === 0 ? 1.4 : 4.5,
                precision: index === 0 ? "high" : "moderate",
              }
            : null,
      })),
    }),
  );
  await page.reload();

  // On Observed nothing of the forecast shows but its tab.
  const panel = page.getByTestId("explore-forecast");
  const estimate = page.getByTestId("explore-estimate");
  await expect(estimate).toContainText("2026");
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Forecast month" })).toHaveCount(0);

  // Choosing it: the figure at the top becomes the month ahead's, with its
  // range across systems; the past months and their pickers give way, and
  // the six coming months follow - a row of months, then the line.
  await page.getByRole("tab", { name: "Next 6 months" }).click();
  await expect(estimate).toContainText("12.0%");
  await expect(estimate).toContainText("Oct 2026 forecast");
  await expect(estimate).toContainText("Range 9.0%–15.0% across 3 forecast systems");
  // The month's precision, from the model's own interval, like an observed one.
  const forecastPrecision = estimate.getByRole("img", { name: /precision/ });
  await expect(forecastPrecision).toHaveAttribute(
    "aria-label",
    "High precision: the 95% interval of the odds ratio is 1.05–1.40",
  );
  // The seasonal cycle stays as context: the place's average year.
  await expect(page.getByTestId("explore-seasonal-cycle")).toContainText(
    "average year",
  );
  await expect(page.getByRole("group", { name: "Month", exact: true })).toHaveCount(0);
  await expect(page.getByTestId("explore-projection")).toHaveCount(0);
  await expect(panel.getByRole("img", { name: /next six months/ })).toBeVisible();
  const chips = panel.getByRole("group", { name: "Months ahead" }).getByRole("button");
  await expect(chips).toHaveCount(6);
  await expect(chips.first()).toHaveText("Oct2026");
  await expect(chips.nth(1)).toHaveText("Nov");
  await expect(chips.nth(3)).toHaveText("Jan2027");
  await expect(panel).toContainText("Oct 2026: 12.0%");
  await expect(panel).toContainText("(9.0%–15.0%)");
  await expect(panel).toContainText("3 forecast systems");
  await expect(panel.getByRole("link", { name: "Copernicus C3S" })).toBeVisible();
  // Pointing at a month reads it out.
  await chips.nth(2).hover();
  await expect(panel).toContainText("Dec 2026: 14.0%");
  await expect(chips.first()).toHaveAttribute("aria-pressed", "true");
  // Right under the tabs and the figure, the six months in one row.
  const picker = page.getByRole("group", { name: "Forecast month" });
  const months6 = picker.getByRole("button");
  await expect(months6).toHaveText(["Oct", "Nov", "Dec", "Jan", "Feb", "Mar"]);
  await expect(months6.first()).toHaveAttribute("aria-pressed", "true");
  await expect(months6.nth(3)).toHaveAttribute("title", "Jan 2027");
  const rows = await months6.evaluateAll(
    (items) =>
      new Set(items.map((item) => Math.round(item.getBoundingClientRect().top))).size,
  );
  expect(rows).toBe(1);
  const heroBox = (await estimate.boundingBox())!;
  const pickerBox = (await picker.boundingBox())!;
  expect(pickerBox.y).toBeGreaterThan(heroBox.y);
  expect(pickerBox.y - (heroBox.y + heroBox.height)).toBeLessThan(40);
  await picker.screenshot({ path: "../outputs/e2e/web/explore-forecast-picker.png" });
  await expect(page.getByTestId("explore-legend")).toContainText(
    "Oct 2026 · Copernicus C3S forecast",
  );
  await chips.nth(1).click();
  await expect(page).toHaveURL(/view=forecast.*month=2026-11/);
  await expect(chips.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(estimate).toContainText("Nov 2026 forecast");
  await expect(forecastPrecision).toHaveAttribute(
    "aria-label",
    "Moderate precision: the 95% interval of the odds ratio is 0.60–4.50",
  );
  await expect(forecastPrecision.locator("i[data-on]")).toHaveCount(2);
  // The row picks too, and the line follows.
  await months6.nth(2).click();
  await expect(page).toHaveURL(/view=forecast.*month=2026-12/);
  await expect(chips.nth(2)).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() =>
      api.requests.some((item) =>
        item.includes("forecast/map?outcome=lbw&month=2026-11"),
      ),
    )
    .toBe(true);
  await panel.screenshot({ path: "../outputs/e2e/web/explore-forecast-line.png" });

  // On a phone the six months stay on one row inside the panel.
  await page.setViewportSize({ width: 390, height: 860 });
  await expect(chips).toHaveCount(6);
  const box = await panel.boundingBox();
  const tops = new Set<number>();
  for (const chip of await chips.all()) {
    const chipBox = await chip.boundingBox();
    expect(chipBox).not.toBeNull();
    tops.add(Math.round(chipBox!.y));
    expect(chipBox!.x).toBeGreaterThanOrEqual(box!.x);
    expect(chipBox!.x + chipBox!.width).toBeLessThanOrEqual(box!.x + box!.width + 1);
  }
  expect(tops.size).toBe(1);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  await panel.screenshot({ path: "../outputs/e2e/web/explore-forecast-phone.png" });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({
    path: "../outputs/e2e/web/explore-forecast.png",
    fullPage: true,
  });
});

test("a low-precision estimate shows one bar and reads softer", async ({ page }) => {
  await openExplore(page, "frame=geo-ke&outcome=lbw");
  await page.route("**/api/chart/heat-outlook/geo-ke/observed?**", (route) => {
    const body = structuredClone(observedFixtures.observed["geo-ke|lbw|P|latest"]);
    (body.estimate as { ratio: unknown }).ratio = {
      kind: "odds_ratio",
      value: 1.6,
      low: 0.9,
      high: 5.4,
      precision: "low",
    };
    return json(route, body);
  });
  await page.reload();

  const estimate = page.getByTestId("explore-estimate");
  const precision = estimate.getByRole("img", { name: /precision/ });
  await expect(precision).toHaveAttribute(
    "aria-label",
    "Low precision: the 95% interval of the odds ratio is 0.90–5.40",
  );
  await expect(precision.locator("i[data-on]")).toHaveCount(1);
  // Red for low precision.
  await expect(precision.locator("i[data-on]")).toHaveCSS(
    "background-color",
    "rgb(221, 46, 90)",
  );
  // The figure itself reads softer (a lighter maroon).
  await expect(estimate.locator("[data-precision='low']")).not.toHaveCSS(
    "color",
    "rgb(85, 17, 31)",
  );
  // Hover shows a card: the level, the interval and what it means.
  const card = precision.locator(":scope > span");
  await expect(card).toHaveCSS("opacity", "0");
  await precision.hover();
  await expect(card).toHaveCSS("opacity", "1");
  await expect(card).toContainText("Low precision");
  await expect(card).toContainText("95% interval of the odds ratio: 0.90–5.40");
  await expect(card).toContainText("treat the figure as a rough guide");
  await page.waitForTimeout(200);
  const at = (await estimate.boundingBox())!;
  await page.screenshot({
    path: "../outputs/e2e/web/explore-precision-card.png",
    clip: { x: 0, y: Math.max(0, at.y - 80), width: 360, height: at.height + 100 },
  });
  await estimate.screenshot({ path: "../outputs/e2e/web/explore-precision-low.png" });
});

test("a click outside the covered places offers a way to bring CHART there", async ({
  page,
}) => {
  const { api } = await openExplore(page, "frame=geo-ke&outcome=lbw");
  // Coverage is read from each country's own outline (its population map).
  api.on(/^\/api\/chart\/heat-outlook\/[^/]+\/population$/, (route) =>
    json(route, {
      ...fixtures.mapFrame,
      metric: "population_density",
      unit: "people_per_km2",
      year: 2025,
      measure: "total",
      source: "WorldPop",
      source_uri: "https://hub.worldpop.org/project/categories?id=3",
      license: "CC BY 4.0",
      counts: {},
    }),
  );
  const map = page.getByTestId("explore-map");
  await expect(map.locator("canvas")).toBeVisible();
  await expect(page.getByTestId("explore-estimate")).toBeVisible();

  // The map's corner is Uganda and South Sudan: not a place CHART covers.
  await map.click({ position: { x: 12, y: 12 } });
  const card = page.getByTestId("explore-outside");
  await expect(card).toContainText("CHART isn’t here yet");
  await expect(card).toContainText("Kenya and Madhya Pradesh");
  const link = card.getByRole("link", { name: /Help bring CHART here/ });
  await expect(link).toHaveAttribute(
    "href",
    /^\/support\?near=-?\d+\.\d{2},-?\d+\.\d{2}$/,
  );
  await page.screenshot({ path: "../outputs/e2e/web/explore-outside.png" });
  await card.getByRole("button", { name: "Close" }).click();
  await expect(card).toHaveCount(0);

  // The support page: what is covered, three ways to help, and a way to write.
  await map.click({ position: { x: 12, y: 12 } });
  await card.getByRole("link", { name: /Help bring CHART here/ }).click();
  await expect(page).toHaveURL(/\/support\?near=/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Bring CHART to your area" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText([
    "Share health data",
    "Climate and modelling work",
    "Partner or fund",
  ]);
  await expect(
    page.getByText(/You were looking near \d+\.\d° [NS], \d+\.\d° [EW]/),
  ).toBeVisible();
  const mail = page.getByRole("link", { name: "Get in touch" });
  await expect(mail).toHaveAttribute("href", /^mailto:info@scopeimpact\.fi\?subject=/);
  expect(decodeURIComponent((await mail.getAttribute("href")) ?? "")).toContain(
    "Area: near ",
  );
  await page.screenshot({ path: "../outputs/e2e/web/support.png", fullPage: true });
  await page.getByRole("link", { name: "Back to the map" }).click();
  await expect(page).toHaveURL(/\/explore/);
});

test("the support page ignores a malformed point", async ({ page }) => {
  await page.goto("/support?near=<script>");
  await expect(
    page.getByRole("heading", { level: 1, name: "Bring CHART to your area" }),
  ).toBeVisible();
  await expect(page.getByText(/You were looking near/)).toHaveCount(0);
});

test("the first map load says so, then clears", async ({ page }) => {
  await page.route("**/heat-outlook/geo-ke/observed/map**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.fallback();
  });
  await openExplore(page, "frame=geo-ke&outcome=lbw");
  const loading = page.getByRole("status").filter({ hasText: "Loading map" });
  await expect(loading).toBeVisible();
  await expect(loading).toHaveCount(0);
  await expect(page.getByTestId("explore-estimate")).toBeVisible();
});

test("vulnerability lays its dots over any view, with its score on hover", async ({
  page,
}) => {
  const { api } = await openExplore(page, "frame=geo-ke&outcome=lbw");
  api.on(/^\/api\/chart\/vra\/geo-ke\/map$/, (route) =>
    json(route, {
      ...fixtures.mapFrame,
      outcome: "vra",
      metric: "vra_index",
      areas: fixtures.mapFrame.areas.map((area, index) => ({
        ...area,
        value_percent: area.geography_id === "geo-ke-kajiado" ? 62 : (index * 7) % 100,
        missing_reason: null,
      })),
    }),
  );
  const toggle = page.getByRole("switch", { name: /Vulnerability \(VRA\)/ });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(page).toHaveURL(/vra=1/);
  const legend = page.getByTestId("explore-legend");
  await expect(legend).toContainText("Vulnerability (VRA)");
  // The heat share stays the map's colour; VRA rides on top, on any time.
  await expect(legend).toContainText("Observed heat share");
  await page.getByRole("tab", { name: "Projections" }).click();
  await expect(toggle).toBeChecked();
  await expect(legend).toContainText("Vulnerability (VRA)");
  await page.getByRole("tab", { name: "Observed" }).click();

  // The hover card gives the area's score.
  await page.getByRole("combobox").fill("Kajiado");
  await page.getByRole("combobox").press("Enter");
  const map = page.getByTestId("explore-map");
  const box = (await map.boundingBox())!;
  await page.waitForTimeout(800);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByTestId("explore-hover")).toContainText(
    "Vulnerability (VRA) 0.62",
  );
  await page.screenshot({ path: "../outputs/e2e/web/explore-vra.png" });
  await toggle.uncheck();
  await expect(legend).not.toContainText("Vulnerability (VRA)");
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
  // The figure's precision bars and their card stay on screen.
  const row = page.getByTestId("explore-estimate");
  const bars = row.getByRole("img", { name: /precision/ });
  await expect(bars).toBeVisible();
  const rowBox = (await row.boundingBox())!;
  const barsBox = (await bars.boundingBox())!;
  expect(barsBox.x + barsBox.width).toBeLessThanOrEqual(rowBox.x + rowBox.width + 1);
  await bars.focus();
  const card = bars.locator(":scope > span");
  await expect(card).toHaveCSS("opacity", "1");
  const cardBox = (await card.boundingBox())!;
  expect(cardBox.x).toBeGreaterThanOrEqual(0);
  expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "../outputs/e2e/web/explore-phone-precision.png",
    clip: { x: 0, y: Math.max(0, cardBox.y - 10), width: 390, height: 260 },
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  await page.screenshot({
    path: "../outputs/e2e/web/explore-phone.png",
    fullPage: true,
  });
});
