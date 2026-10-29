import { expect, test, type Page } from "@playwright/test";

import { installFakeApi } from "./support/fakeApi";
import { installKenya } from "./support/kenya";

// The trimesters are off by default (whole pregnancy only); these tests
// read the 3rd trimester, so the fake API starts with it switched on.
const withThirdTrimester = { settings: { lbw: { selectors: ["P", "T3"] } } };

// The question reads like India's ("may be attributable to heat exposure"),
// so the Kenya panel is found by its test id rather than its heading.
const panel = (page: Page) => page.getByTestId("heat-outlook");

/** The published projections sit behind the Projected tab. */
async function projected(page: Page) {
  const outlook = panel(page);
  await outlook.getByRole("tab", { name: "Projected" }).click();
  await expect(outlook.getByRole("tab", { name: "Projected" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  return outlook;
}

test("Kenya LBW: the map, icon array, odds ratio and precision follow the selected county", async ({
  page,
}) => {
  const api = await installKenya(page, true, ["/kenya"], withThirdTrimester);
  await page.goto("/dashboard/geo-ke?admin_unit=geo-ke-kajiado&outcome=lbw");

  const outlook = await projected(page);
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
  await expect(outlook.getByRole("group", { name: "Time horizon" })).toContainText(
    "1981–2010 (baseline)",
  );

  // Choosing a county on the map moves every figure to it.
  await outlook.getByRole("button", { name: /^Garissa: 36\.16% attributable/ }).click();
  await page.waitForURL(/admin_unit=geo-ke-garissa/);
  await expect(estimate).toContainText("36.2% of low birth weight cases in Garissa");
  await expect(
    outlook.getByRole("img", { name: "36 of 100 newborn figures highlighted" }),
  ).toBeVisible();

  // Projections are read from published tables: no month grid, no polling.
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

  const outlook = await projected(page);
  await expect(outlook.getByRole("combobox", { name: "Age group" })).toContainText(
    "Post-neonatal",
  );
  await expect(
    outlook.getByRole("note").filter({ hasText: "Approximate death dates." }),
  ).toBeVisible();
  await expect(outlook.getByRole("group", { name: "Time horizon" })).toContainText(
    "1991–2020 (baseline)",
  );
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
  await installKenya(page, false, ["/kenya"], { observedStatus: 404 });
  await page.goto("/dashboard/geo-ke?admin_unit=geo-ke-kajiado&outcome=lbw");
  await expect(page.getByText("Observed months are not available")).toBeVisible();
  await expect(panel(page).getByRole("tab", { name: "Projected" })).toBeEnabled();
  await panel(page).getByRole("tab", { name: "Projected" }).click();
  await expect(
    panel(page).getByText(
      "No projection has been published for this place and outcome yet.",
    ),
  ).toBeVisible();
  await expect(panel(page).getByTestId("outlook-estimate")).toHaveCount(0);
  await panel(page).getByRole("tab", { name: "Observed" }).click();
  await expect(page.getByText("Observed months are not available")).toBeVisible();

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
  await expect(panel(page).getByTestId("outlook-estimate")).toContainText(
    /in Kenya.*averaged over \d+ counties/,
  );
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
  const api = await installKenya(page, true, ["/kenya"], withThirdTrimester);
  await page.goto("/dashboard/geo-ke?admin_unit=geo-ke-kajiado&outcome=lbw");
  const outlook = await projected(page);
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
  const outlook = await projected(page);
  await outlook.getByRole("button", { name: /^Narok: Not integrated/ }).click();
  await page.waitForURL(/admin_unit=geo-ke-narok/);
  await expect(outlook.getByText("No projection has been published")).toBeVisible();

  await outlook.getByRole("button", { name: /^Garissa: 36\.16% attributable/ }).click();
  await page.waitForURL(/admin_unit=geo-ke-garissa/);
  await expect(outlook.getByTestId("outlook-estimate")).toContainText("Garissa");
});
