import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import {
  catalogEntry,
  geographies,
  installFakeApi,
  json,
  type FakeApi,
} from "./support/fakeApi";

// Responses produced by the real Python service from the modeller's published
// Kenya tables (v2_2026_10_06) and the dev database's county shapes. The
// browser sees his numbers and real geometry, not invented ones.
type MapValues = Record<string, Record<string, Record<string, unknown>>>;
const fixtures = JSON.parse(
  readFileSync(new URL("./fixtures/heat-outlook-kenya.json", import.meta.url), "utf8"),
) as {
  outlook: Record<string, unknown>;
  mapFrame: { areas: { geography_id: string }[] };
  mapValues: MapValues;
};

const county = (slug: string, name: string) => ({
  id: `geo-ke-${slug}`,
  name,
  path: `/kenya/${slug}`,
  levelLabel: "County",
  parentId: "geo-ke",
  supportsPrediction: true,
  models: [
    { outcome: "lbw", modelAreaName: name, releaseId: "ke-lbw" },
    { outcome: "under_5_mortality", modelAreaName: name, releaseId: "ke-u5" },
  ],
});

const kenya = [
  {
    id: "geo-ke",
    name: "Kenya",
    path: "/kenya",
    levelLabel: "Country",
    parentId: null,
    models: [],
  },
  county("kajiado", "Kajiado"),
  county("garissa", "Garissa"),
  county("narok", "Narok"),
];

const defaultSelector = (outcome: string) => (outcome === "lbw" ? "P" : "postneonatal");

async function installKenya(
  page: Page,
  published = true,
  geographyScopes = ["/kenya"],
): Promise<FakeApi> {
  const api = await installFakeApi(page);
  api.on(/^\/api\/chart\/auth\/me$/, (route) =>
    json(route, {
      userId: "e2e-user",
      username: "planner",
      roles: ["health_planning_lead"],
      geographyScopes,
    }),
  );
  api.on(/^\/api\/chart\/geographies$/, (route) =>
    json(route, [...geographies, ...kenya]),
  );
  api.on(/^\/api\/chart\/model-catalog$/, (route) =>
    json(route, {
      items: [
        catalogEntry("lbw", "Low birth weight", "ke-lbw"),
        catalogEntry("under_5_mortality", "Under-five mortality", "ke-u5"),
      ],
    }),
  );
  api.on(/^\/api\/chart\/heat-outlook\/[^/]+\/map$/, (route, url) => {
    const outcome = url.searchParams.get("outcome") ?? "lbw";
    const values =
      fixtures.mapValues[
        `${outcome}|${url.searchParams.get("selector") ?? defaultSelector(outcome)}`
      ];
    if (!published || !values)
      return json(route, { error: "OUTLOOK_NOT_PUBLISHED" }, 404);
    return json(route, {
      ...fixtures.mapFrame,
      outcome,
      areas: fixtures.mapFrame.areas.map((area) => ({
        ...area,
        ...values[area.geography_id],
      })),
    });
  });
  api.on(/^\/api\/chart\/heat-outlook\/[^/]+$/, (route, url) => {
    const geography = url.pathname.split("/").pop();
    const outcome = url.searchParams.get("outcome") ?? "lbw";
    const selector = url.searchParams.get("selector") ?? defaultSelector(outcome);
    const body = published
      ? fixtures.outlook[`${geography}|${outcome}|${selector}`]
      : undefined;
    return body
      ? json(route, body)
      : json(route, { error: "OUTLOOK_NOT_PUBLISHED" }, 404);
  });
  return api;
}

const panel = (page: Page) =>
  page.getByRole("region", { name: /may be attributable to heat in an average year/ });

test("Kenya LBW: the map, icon array, odds ratio and precision follow the selected county", async ({
  page,
}) => {
  const api = await installKenya(page);
  await page.goto("/dashboard/geo-ke?admin_unit=geo-ke-kajiado&outcome=lbw");

  const outlook = panel(page);
  const estimate = outlook.getByTestId("outlook-estimate");
  // Kajiado, whole pregnancy, 2041-2060, SSP5-8.5: 11.1% in the modeller's table.
  await expect(estimate).toContainText("11.1% of low birth weight cases in Kajiado");
  await expect(outlook.getByTestId("outlook-ratio")).toContainText(
    "Odds ratio 1.14 (95% CI 0.99–1.29)",
  );
  await expect(estimate.getByRole("button", { name: /High/ })).toBeVisible();
  await expect(
    outlook.getByRole("img", { name: "11 of 100 newborn figures highlighted" }),
  ).toBeVisible();
  await expect(outlook.getByTestId("outlook-baseline")).toContainText("1981–2010");

  // Choosing a county on the map moves every figure to it.
  await outlook.getByRole("button", { name: /^Garissa: 36\.16% attributable/ }).click();
  await page.waitForURL(/admin_unit=geo-ke-garissa/);
  await expect(estimate).toContainText("36.2% of low birth weight cases in Garissa");
  await expect(
    outlook.getByRole("img", { name: "36 of 100 newborn figures highlighted" }),
  ).toBeVisible();

  // Nothing is prepared or polled: Kenya reads published tables only.
  await expect(page.getByRole("group", { name: /Months in/ })).toHaveCount(0);
  expect(api.requests.some((r) => r.includes("/climate/predict"))).toBe(false);
  // Let the icon array finish its colour transition before capturing.
  await page.waitForTimeout(400);
  await page.screenshot({
    path: "../outputs/e2e/web/heat-outlook-lbw.png",
    fullPage: true,
  });

  await outlook.getByRole("combobox", { name: "Pregnancy window" }).click();
  await page.getByRole("option", { name: "3rd trimester (lags 0-2)" }).click();
  await expect(estimate).toContainText("No excess heat risk estimated for this window");
  await expect(outlook.getByRole("img", { name: /of 100/ })).toHaveCount(0);
  await expect(
    outlook.getByRole("button", { name: /^Garissa: Not reported/ }),
  ).toBeVisible();
  // Let the icon array finish its colour transition before capturing.
  await page.waitForTimeout(400);
  await page.screenshot({
    path: "../outputs/e2e/web/heat-outlook-lbw-t3.png",
    fullPage: true,
  });
  expect(api.unhandled).toEqual([]);
});

test("Kenya under-five: post-neonatal by default, approximate death dates noted, with a risk ratio", async ({
  page,
}) => {
  const api = await installKenya(page);
  await page.goto(
    "/dashboard/geo-ke?admin_unit=geo-ke-kajiado&outcome=under_5_mortality",
  );

  const outlook = panel(page);
  await expect(outlook.getByRole("combobox", { name: "Age group" })).toContainText(
    "Post-neonatal",
  );
  await expect(
    outlook.getByRole("note").filter({ hasText: "Approximate death dates." }),
  ).toBeVisible();
  await expect(outlook.getByTestId("outlook-baseline")).toContainText("1991–2020");
  await expect(outlook.getByTestId("outlook-ratio")).toContainText("Risk ratio");
  // The exposed population is children, not pregnant women.
  await expect(page.getByText("children under five").first()).toBeVisible();
  await expect(outlook.getByRole("combobox", { name: "Age group" })).not.toContainText(
    "exploratory",
  );
  await expect(
    outlook.getByRole("img", { name: /of 100 newborn figures highlighted/ }),
  ).toBeVisible();
  // Let the icon array finish its colour transition before capturing.
  await page.waitForTimeout(400);
  await page.screenshot({
    path: "../outputs/e2e/web/heat-outlook-u5.png",
    fullPage: true,
  });
  expect(api.unhandled).toEqual([]);
});

test("a place without published tables says so, and other countries keep the live panel", async ({
  page,
}) => {
  await installKenya(page, false);
  await page.goto("/dashboard/geo-ke?admin_unit=geo-ke-kajiado&outcome=lbw");
  await expect(
    page.getByText("No outlook has been published for this place"),
  ).toBeVisible();

  await installFakeApi(page);
  await page.goto("/dashboard/geo-in-mp?admin_unit=geo-in-mp-bhopal&outcome=lbw");
  await expect(
    page.getByRole("heading", { name: /may be attributable to heat exposure/ }),
  ).toBeVisible();
  await expect(panel(page)).toHaveCount(0);
});

test("planning for Kenya starts on Kenya, not on its first county", async ({
  page,
}) => {
  const api = await installKenya(page);
  await page.goto("/plan");

  await expect(page.getByText("in Kenya.", { exact: false }).first()).toBeVisible();
  await page.getByRole("button", { name: "Start planning together" }).click();
  await page.waitForURL(/\/dashboard\/geo-ke(\?|$)/);
  expect(page.url()).not.toContain("geo-ke-baringo");
  expect(page.url()).not.toContain("admin_unit");
  await expect(panel(page).getByTestId("outlook-estimate")).toContainText("in Kenya");
  await page.waitForTimeout(400);
  await page.screenshot({
    path: "../outputs/e2e/web/heat-outlook-kenya.png",
    fullPage: true,
  });
  expect(api.unhandled).toEqual([]);
});

test("switching country on the dashboard lands on Kenya, not its first county", async ({
  page,
}) => {
  await installKenya(page, true, ["/india", "/kenya"]);
  await page.goto("/dashboard/geo-in-mp?admin_unit=geo-in-mp-bhopal&outcome=lbw");

  const context = page.getByRole("group", { name: "Dashboard context" });
  await context.getByRole("combobox", { name: "Country", exact: true }).click();
  await page.getByRole("option", { name: "Kenya", exact: true }).click();
  await page.waitForURL(/\/dashboard\/geo-ke(\?|$)/);
  expect(page.url()).not.toContain("admin_unit");
});

test("switching outcome never asks the map for the previous outcome's window", async ({
  page,
}) => {
  const api = await installKenya(page);
  await page.goto("/dashboard/geo-ke?admin_unit=geo-ke-kajiado&outcome=lbw");
  const outlook = panel(page);
  await outlook.getByRole("combobox", { name: "Pregnancy window" }).click();
  await page.getByRole("option", { name: "3rd trimester (lags 0-2)" }).click();
  await expect(
    outlook.getByRole("button", { name: /^Garissa: Not reported/ }),
  ).toBeVisible();

  const context = page.getByRole("group", { name: "Dashboard context" });
  await context.getByRole("combobox", { name: "Health outcome", exact: true }).click();
  await page.getByRole("option", { name: "Under-five mortality", exact: true }).click();
  await page.waitForURL(/outcome=under_5_mortality/);
  await expect(outlook.getByRole("combobox", { name: "Age group" })).toBeVisible();
  await expect(outlook.getByText("could not load")).toHaveCount(0);
  expect(
    api.requests.filter(
      (r) => r.includes("outcome=under_5_mortality") && r.includes("selector=T3"),
    ),
  ).toEqual([]);

  // Neonatal: no county has a heat excess, and the legend says so.
  await outlook.getByRole("combobox", { name: "Age group" }).click();
  await page.getByRole("option", { name: /^Neonatal/ }).click();
  await expect(
    outlook.getByRole("button", { name: "No heat excess", exact: true }),
  ).toBeVisible();
});

test("a county with no published tables keeps the map, so another can be chosen", async ({
  page,
}) => {
  await installKenya(page);
  await page.goto("/dashboard/geo-ke?admin_unit=geo-ke-kajiado&outcome=lbw");
  const outlook = panel(page);
  await outlook.getByRole("button", { name: /^Narok: Not integrated/ }).click();
  await page.waitForURL(/admin_unit=geo-ke-narok/);
  await expect(outlook.getByText("No outlook has been published")).toBeVisible();

  await outlook.getByRole("button", { name: /^Garissa: 36\.16% attributable/ }).click();
  await page.waitForURL(/admin_unit=geo-ke-garissa/);
  await expect(outlook.getByTestId("outlook-estimate")).toContainText("Garissa");
});
