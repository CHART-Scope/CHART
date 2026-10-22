import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

import { filledTemplate, installVra } from "./support/vra";

// The vulnerability assessment in the browser: the real Next build against the
// in-memory VRA service (support/vra.ts), which validates uploads and scores
// runs the way the contract says the API does. Covered here: the page's map,
// ranking and drill-down; the empty state; an admin's upload with rejected
// rows, then a run that the page then shows; what a planner is denied; a
// country switch moving the frame (and a frame outside the planner's area
// refused); and the phone layout.

const evidence = "../outputs/e2e/web/vra";
const planner = { roles: ["health_planning_lead"], geographyScopes: ["/india"] };
const MP = "geo-in-madhya-pradesh";

const ranking = (page: Page) => page.getByRole("list", { name: /by risk$/ });
const detail = (page: Page) =>
  page.getByRole("region", { name: /./ }).filter({
    has: page.getByText("Area detail", { exact: true }),
  });
const card = (page: Page) =>
  page.getByRole("region", { name: "Indicator values per area" });

async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test("an assessed state shows its map, its ranking and one area opened up", async ({
  page,
}) => {
  const api = await installVra(page, { ...planner, assessed: ["mp"] });
  // The sidebar entry opens the planning area's state, not India.
  await page.goto("/learning");
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Vulnerability", exact: true })
    .click();
  await page.waitForURL(new RegExp(`/vulnerability/${MP}$`));
  await expect(
    page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Vulnerability" }),
  ).toHaveAttribute("aria-current", "page");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Vulnerability across Madhya Pradesh",
    }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Relative within Madhya Pradesh: higher means more vulnerable to climate-health risk.",
    ),
  ).toBeVisible();
  const about = page.getByRole("definition");
  await expect(about).toContainText([
    "22 Oct 2026",
    "vra-v1, equal weights",
    "10 divisions",
  ]);
  // The place picker is the dashboard's, without the model pickers.
  await expect(page.getByRole("combobox", { name: "State", exact: true })).toHaveText(
    /Madhya Pradesh/,
  );
  await expect(page.getByRole("combobox", { name: "Health outcome" })).toHaveCount(0);

  // Map: every division drawn, coloured by the run's classes, legend by class.
  const shapes = page.locator("svg path[data-interactive]");
  await expect(shapes).toHaveCount(10);
  const legend = page.getByRole("group", { name: "Class: highlight a class" });
  for (const label of ["Low", "Moderate", "High", "Very high", "Unavailable"])
    await expect(
      legend.getByRole("button", { name: label, exact: true }),
    ).toBeVisible();
  // Shahdol has no exposure data: drawn, not omitted, and said why.
  await expect(
    page.getByRole("button", { name: /^Shahdol Division: Insufficient data/ }),
  ).toBeVisible();

  // Ranking: nine ranked, the unscored division last.
  const rows = ranking(page).getByRole("listitem");
  await expect(rows).toHaveCount(10);
  await expect(rows.first().getByRole("button")).toHaveAccessibleName(/^1\. /);
  await expect(rows.last()).toContainText("Shahdol Division");
  await expect(rows.last()).toContainText("Not scored");
  await page.screenshot({ path: `${evidence}/page-desktop.png`, fullPage: true });

  // Open the top-ranked division from the list.
  const top = rows.first().getByRole("button");
  const topName = ((await top.getAttribute("aria-label")) ?? "").replace(
    /^1\. ([^,]+),.*$/,
    "$1",
  );
  await top.click();
  await page.waitForURL(/\?area=geo-in-madhya-pradesh-division-/);
  await expect(top).toHaveAttribute("aria-pressed", "true");
  const panel = detail(page);
  await expect(panel.getByRole("heading", { level: 2, name: topName })).toBeVisible();
  await expect(panel).toContainText(/Rank 1 of 9/);
  for (const label of [
    "Hazard",
    "Exposure",
    "Sensitivity",
    "Lack of adaptive capacity",
    "Vulnerability",
  ])
    await expect(panel.getByRole("meter", { name: label, exact: true })).toBeVisible();
  await expect(panel).toContainText("higher always means more risk");

  // Indicators: raw value with unit, vintage, score, provenance and badges.
  const table = panel.getByRole("table", { name: `Indicators for ${topName}` });
  await expect(table.locator("thead th")).toHaveText([
    "Indicator",
    "Value",
    "Vintage",
    "Score",
    "Contribution",
  ]);
  // Grouped by component, adaptive capacity named as its lack.
  // Each group names its component and how many of its indicators have data.
  await expect(table.locator("tbody > tr:first-child > th")).toHaveText([
    /^Hazard\d+ of \d+ with data$/,
    /^Exposure\d+ of \d+ with data$/,
    /^Sensitivity\d+ of \d+ with data$/,
    /^Lack of adaptive capacity\d+ of \d+ with data$/,
  ]);
  const heat = table.getByRole("row", { name: "Heatwave days, last 12 months" });
  await expect(heat).toContainText(/\d+(\.\d)? days/);
  await expect(heat).toContainText("Computed");
  await expect(heat).toContainText("2025-10/2026-09");
  const density = table.getByRole("row", { name: "Population density" });
  await expect(density).toContainText("persons/km²");
  await expect(
    density.getByRole("link", { name: "Census of India 2011" }),
  ).toHaveAttribute("href", "https://example.org/test-source.csv");
  // The same value everywhere cannot rank anyone: excluded, and said so.
  const plan = table.getByRole("row", { name: "Heat action plan in place" });
  await expect(plan).toContainText("Excluded: no spread");
  await expect(plan).toContainText("Entered by hand");
  await expect(plan).toContainText("State level");
  // Provenance detail (months, variable) is not a caveat, so not a badge.
  await expect(heat).not.toContainText("Months");
  // Indicators without data are hidden until asked for.
  const utci = table.getByRole("row", { name: "UTCI heat stress days" });
  await expect(utci).toHaveCount(0);
  await panel
    .getByRole("button", { name: /^Show \d+ indicators without data$/ })
    .click();
  await expect(utci).toContainText("Missing");
  await expect(utci).toContainText("Higher is worse");
  await expect(
    table.getByRole("row", { name: "Women with 10+ years of schooling" }),
  ).toContainText("Lower is worse");
  await page.screenshot({ path: `${evidence}/drilldown-desktop.png`, fullPage: true });

  // The map opens another division; the panel follows.
  await page.getByRole("button", { name: /^Rewa Division: / }).click();
  await page.waitForURL(/area=geo-in-madhya-pradesh-division-rewa/);
  await expect(
    panel.getByRole("heading", { level: 2, name: "Rewa Division" }),
  ).toBeVisible();
  await expect(
    panel.getByRole("table", { name: "Indicators for Rewa Division" }),
  ).toBeVisible();

  // The unscored division opens too, and says why.
  await rows.last().getByRole("button").click();
  await expect(panel).toContainText("Insufficient data: too few indicators have data");

  await panel.getByRole("button", { name: "Close" }).click();
  await page.waitForURL(new RegExp(`/vulnerability/${MP}$`));
  await expect(page.getByText("Area detail", { exact: true })).toHaveCount(0);

  // A planner is offered nothing administrative.
  await expect(page.getByRole("link", { name: /Settings → Data/ })).toHaveCount(0);
  expect(api.requests.filter((r) => /coverage|template|values|runs/.test(r))).toEqual(
    [],
  );
  // (The Learning hub we started from reads its own catalogue, not faked here.)
  expect(api.unhandled.filter((r) => !r.includes("/learning/"))).toEqual([]);
});

test("before any run the page says so, and sends an admin to Settings", async ({
  page,
}) => {
  const api = await installVra(page);
  await page.goto(`/vulnerability/${MP}`);
  await expect(
    page.getByRole("heading", { name: "Madhya Pradesh has not been assessed yet" }),
  ).toBeVisible();
  await expect(page.locator("svg path[data-interactive]")).toHaveCount(0);
  await expect(ranking(page)).toHaveCount(0);
  await page.screenshot({ path: `${evidence}/empty-admin.png`, fullPage: true });
  expect(api.requests.some((r) => r.includes("/vra/geo-in-madhya-pradesh/map"))).toBe(
    false,
  );

  await page
    .getByRole("link", { name: "Load indicators and run it in Settings → Data" })
    .click();
  await page.waitForURL(/\/settings\?tab=data&vra_frame=geo-in-madhya-pradesh$/);
  await expect(card(page)).toBeVisible();
  await expect(
    card(page).getByRole("combobox", { name: "Place to assess" }),
  ).toHaveText(/Madhya Pradesh · 10 divisions/);
  expect(api.unhandled).toEqual([]);
});

test("a planner sees the empty state without an admin link", async ({ page }) => {
  await installVra(page, planner);
  await page.goto(`/vulnerability/${MP}`);
  await expect(
    page.getByText(
      "An administrator runs it from Settings once indicator data is loaded.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Settings → Data/ })).toHaveCount(0);
  await page.screenshot({ path: `${evidence}/empty-planner.png`, fullPage: true });
});

test("an admin uploads values, sees each rejected row, runs, and the page shows it", async ({
  page,
}) => {
  const api = await installVra(page);
  await page.goto(`/settings?tab=data&vra_frame=${MP}`);
  const indicators = card(page);
  await expect(
    indicators.getByRole("combobox", { name: "Place to assess" }),
  ).toHaveText(/Madhya Pradesh/);
  // Nothing held yet.
  await indicators.getByRole("button", { name: /^Exposure/ }).click();
  await expect(
    indicators.getByRole("row", { name: "Population density" }),
  ).toContainText("0 of 10");
  await expect(
    indicators.getByText("Nothing uploaded for this place yet."),
  ).toBeVisible();

  // The template: one row per division and uploadable indicator, values blank.
  const download = page.waitForEvent("download");
  await indicators.getByRole("button", { name: "Download template" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe(`vra-template-${MP}.csv`);
  const template = (await readFile((await file.path()) as string, "utf8"))
    .trim()
    .split("\n");
  expect(template[0]).toBe(
    "area_code,area_name,indicator_code,value,vintage,source_name,source_url,notes",
  );
  expect(template).toContain("bhopal,Bhopal Division,exp.population_density,,,,,");
  expect(template.some((line) => line.includes("haz.heatwave_days_12m"))).toBe(false);

  // A filled file with four bad rows: unknown area, computed indicator, a
  // value that is not a number, a missing vintage.
  const csv = filledTemplate([
    "atlantis,Atlantis,exp.population_density,410,2011,Census,,",
    "bhopal,Bhopal Division,haz.heatwave_days_12m,12,2025,,,",
    "rewa,Rewa Division,sens.elderly_share,n/a,2011,,,",
    "sagar,Sagar Division,sens.elderly_share,6.1,,,,",
  ]);
  const accepted = csv.trim().split("\n").length - 1 - 4;
  await indicators.getByLabel("Upload CSV file").setInputFiles({
    name: "mp-indicators.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  const result = indicators
    .getByRole("status")
    .filter({ hasText: "mp-indicators.csv" });
  await expect(result).toContainText(
    `mp-indicators.csv: ${accepted} rows accepted, 4 rejected.`,
  );
  const rejected = result.getByRole("list", { name: "Rejected rows" });
  await expect(rejected.getByRole("listitem")).toHaveText([
    /Row \d+area_code "atlantis" is not a division of Madhya Pradesh/,
    /Row \d+indicator_code "haz.heatwave_days_12m" cannot be uploaded \(computed by CHART\)/,
    /Row \d+value "n\/a" is not a number/,
    /Row \d+vintage is required/,
  ]);
  // The file went to the API as CSV text, named.
  expect(api.uploads).toHaveLength(1);
  expect(api.uploads[0]).toMatchObject({
    frame: MP,
    fileName: "mp-indicators.csv",
    contentType: "text/csv",
  });
  expect(api.uploads[0].body).toBe(csv);

  // Coverage is read again: nine of ten divisions have exposure values.
  await expect(
    indicators.getByRole("row", { name: "Population density" }),
  ).toContainText("9 of 10");
  await expect(
    indicators.getByRole("row", { name: "Population density" }),
  ).toContainText("2011");
  const recent = indicators.getByRole("listitem", {
    name: "mp-indicators.csv, Completed",
  });
  await expect(recent).toContainText(`${accepted} accepted · 4 rejected`);
  await page.screenshot({ path: `${evidence}/upload-partial.png`, fullPage: true });

  // A file with no usable row is refused whole.
  await indicators.getByLabel("Upload CSV file").setInputFiles({
    name: "wrong.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "area_code,area_name,indicator_code,value,vintage,source_name,source_url,notes\natlantis,,exp.population_density,1,2011,,,\n",
    ),
  });
  await expect(indicators.getByRole("alert")).toContainText(
    "wrong.csv was not loaded: no row could be used.",
  );
  await expect(
    indicators.getByRole("listitem", { name: "wrong.csv, Failed" }),
  ).toBeVisible();
  await expect(
    indicators.getByRole("row", { name: "Population density" }),
  ).toContainText("9 of 10");

  // Run: nine divisions scored; the link opens the page with the result.
  await indicators.getByRole("button", { name: "Run assessment" }).click();
  await expect(
    indicators.getByRole("status").filter({ hasText: "Assessment run" }),
  ).toContainText("Assessment run: 9 of 10 divisions scored");
  expect(api.runs).toEqual([MP]);
  await indicators.getByRole("button", { name: /^Hazard/ }).click();
  await expect(
    indicators.getByRole("row", { name: "Heatwave days, last 12 months" }),
  ).toContainText("10 of 10");
  await page.screenshot({ path: `${evidence}/run-done.png`, fullPage: true });

  await indicators
    .getByRole("link", { name: "Open the vulnerability map for Madhya Pradesh" })
    .click();
  await page.waitForURL(new RegExp(`/vulnerability/${MP}$`));
  await expect(ranking(page).getByRole("listitem")).toHaveCount(10);
  await expect(page.locator("svg path[data-interactive]")).toHaveCount(10);
  expect(api.unhandled).toEqual([]);
});

test("a planner has no indicators card and the admin endpoints refuse them", async ({
  page,
}) => {
  const api = await installVra(page, { ...planner, assessed: ["mp"] });
  await page.goto(`/settings?tab=data&vra_frame=${MP}`);
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByText("Planning location")).toBeVisible();
  await expect(card(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Run assessment" })).toHaveCount(0);
  expect(api.requests.filter((r) => r.includes("/api/chart/vra/"))).toEqual([]);

  // Asked directly from the signed-in page, the admin endpoints say no.
  const statuses = await page.evaluate(async (frame) => {
    const calls = [
      fetch(`/api/chart/vra/${frame}/coverage`),
      fetch(`/api/chart/vra/${frame}/template.csv`),
      fetch(`/api/chart/vra/${frame}/values?file_name=x.csv`, {
        method: "POST",
        headers: { "content-type": "text/csv" },
        body: "area_code\n",
      }),
      fetch(`/api/chart/vra/${frame}/runs`, { method: "POST" }),
    ];
    return Promise.all(calls.map(async (call) => (await call).status));
  }, MP);
  expect(statuses).toEqual([403, 403, 403, 403]);
});

test("switching country moves the frame: Kenya ranks Kenya's counties", async ({
  page,
}) => {
  const api = await installVra(page, { assessed: ["mp", "ke"] });
  await page.goto(`/vulnerability/${MP}`);
  await expect(ranking(page)).toContainText("Bhopal Division");

  await choose(page, "Country", "Kenya");
  await page.waitForURL(/\/vulnerability\/geo-ke$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Vulnerability across Kenya" }),
  ).toBeVisible();
  await expect(ranking(page).getByRole("listitem")).toHaveCount(47);
  await expect(ranking(page)).toContainText("Baringo");
  await expect(ranking(page)).not.toContainText("Division");
  await expect(page.locator("svg path[data-interactive]")).toHaveCount(47);
  expect(api.requests).toContain("GET /api/chart/vra/geo-ke/assessment");

  // A county from the picker opens it within Kenya.
  await choose(page, "County", "Kajiado");
  await page.waitForURL(/\/vulnerability\/geo-ke\?area=geo-ke-kajiado$/);
  await expect(
    detail(page).getByRole("heading", { level: 2, name: "Kajiado" }),
  ).toBeVisible();
  await page.screenshot({ path: `${evidence}/kenya-desktop.png`, fullPage: true });

  // A leaf in the URL opens its parent frame with itself selected.
  await page.goto("/vulnerability/geo-in-madhya-pradesh-division-indore");
  await page.waitForURL(
    /\/vulnerability\/geo-in-madhya-pradesh\?area=geo-in-madhya-pradesh-division-indore$/,
  );
  await expect(
    detail(page).getByRole("heading", { level: 2, name: "Indore Division" }),
  ).toBeVisible();
  expect(api.unhandled).toEqual([]);
});

test("a frame outside the planner's area is refused, not shown", async ({ page }) => {
  await installVra(page, { ...planner, assessed: ["mp", "ke"] });
  await page.goto("/vulnerability/geo-ke");
  await expect(
    page.getByRole("alert").filter({ hasText: "outside your planning area" }),
  ).toHaveText("This place is outside your planning area.Try again");
  await expect(ranking(page)).toHaveCount(0);
  await expect(page.getByText("Baringo")).toHaveCount(0);
  // Only India is offered: there is no country to switch to.
  await expect(page.getByRole("combobox", { name: "Country" })).toHaveCount(0);
});

test("the page and the indicators card fit a phone without sideways scrolling", async ({
  page,
}) => {
  await installVra(page, { assessed: ["mp"] });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/vulnerability/${MP}`);
  await expect(ranking(page).getByRole("listitem")).toHaveCount(10);
  await noSidewaysScroll(page);
  await page.screenshot({ path: `${evidence}/page-phone.png`, fullPage: true });

  await ranking(page).getByRole("listitem").first().getByRole("button").click();
  await expect(detail(page).getByRole("table")).toBeVisible();
  await expect(detail(page)).toBeInViewport();
  await noSidewaysScroll(page);
  await page.screenshot({ path: `${evidence}/drilldown-phone.png`, fullPage: true });

  await page.goto(`/settings?tab=data&vra_frame=${MP}`);
  await card(page)
    .getByRole("button", { name: /^Sensitivity/ })
    .click();
  await expect(card(page).getByRole("row", { name: "Anaemia in women" })).toBeVisible();
  await noSidewaysScroll(page);
  await page.screenshot({ path: `${evidence}/settings-phone.png`, fullPage: true });
});
