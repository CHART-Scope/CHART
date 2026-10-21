import { expect, test, type Page } from "@playwright/test";

import { installKenya } from "./support/kenya";

// Settings live on the admin settings page; the dashboard reads the options
// the API leaves on. The fake API applies the saved settings to the Kenya
// outlook exactly as the Python service does (see support/kenya.ts).
const admin = { roles: ["chart_admin", "health_planning_lead"] };

const settingsFor = (page: Page, title: string) =>
  page.getByRole("group", { name: title, exact: true });

const outlookPanel = (page: Page) => page.getByTestId("heat-outlook");

async function optionsOf(page: Page, combobox: string): Promise<string[]> {
  await outlookPanel(page).getByRole("combobox", { name: combobox }).click();
  const options = page.getByRole("option");
  await expect(options.first()).toBeVisible();
  const labels = await options.allInnerTexts();
  await page.keyboard.press("Escape");
  // The selected option carries a check mark after its label.
  return labels.map((label) => label.replace("✓", "").trim());
}

test("turning on a pregnancy window saves it and the dashboard offers it", async ({
  page,
}) => {
  const api = await installKenya(page, true, ["/kenya"], admin);

  // Before any setting: the outlook offers the whole pregnancy only.
  await page.goto("/dashboard/geo-ke?admin_unit=geo-ke-kajiado&outcome=lbw");
  await expect(outlookPanel(page).getByTestId("outlook-estimate")).toContainText(
    "Kajiado",
  );
  expect(await optionsOf(page, "Pregnancy window")).toEqual([
    "Whole pregnancy (lags 0-8)",
  ]);

  await page.goto("/settings");
  const lbw = settingsFor(page, "Low birth weight");
  const windows = lbw.getByRole("group", { name: "Pregnancy windows" });
  await expect(
    windows.getByRole("checkbox", { name: /Whole pregnancy/ }),
  ).toBeChecked();
  await expect(
    windows.getByRole("checkbox", { name: /3rd trimester/ }),
  ).not.toBeChecked();
  await windows.getByRole("checkbox", { name: /3rd trimester/ }).check();

  const saved = page.waitForRequest(
    (request) =>
      request.method() === "PUT" && request.url().endsWith("/model-settings/KE/lbw"),
  );
  await lbw.getByRole("button", { name: "Save Low birth weight" }).click();
  expect((await saved).postDataJSON()).toEqual({
    selectors: ["P", "T3"],
    default_selector: "P",
    scenarios: ["ssp126", "ssp370", "ssp585"],
    default_scenario: "ssp585",
    data_modes: ["observed", "projection"],
  });
  await expect(lbw.getByRole("status")).toHaveText("Saved.");
  await page.screenshot({
    path: "../outputs/e2e/web/model-settings-saved.png",
    fullPage: true,
  });

  // The dashboard now offers exactly the windows switched on.
  await page.goto("/dashboard/geo-ke?admin_unit=geo-ke-kajiado&outcome=lbw");
  expect(await optionsOf(page, "Pregnancy window")).toEqual([
    "Whole pregnancy (lags 0-8)",
    "3rd trimester (lags 0-2)",
  ]);
  await outlookPanel(page).getByRole("combobox", { name: "Pregnancy window" }).click();
  await page.getByRole("option", { name: "3rd trimester (lags 0-2)" }).click();
  await expect(outlookPanel(page).getByTestId("outlook-estimate")).toContainText(
    "No excess heat risk estimated for this window",
  );
  expect(api.settingsWrites).toHaveLength(1);
  expect(api.unhandled.filter((request) => request.includes("model-settings"))).toEqual(
    [],
  );
});

test("switching off an age group hides it from the dashboard", async ({ page }) => {
  const api = await installKenya(page, true, ["/kenya"], admin);
  await page.goto("/settings");

  const u5 = settingsFor(page, "Under-five mortality");
  const groups = u5.getByRole("group", { name: "Age groups" });
  await expect(
    groups.getByRole("radio", { name: /Default: Post-neonatal/ }),
  ).toBeChecked();
  for (const name of [
    /^Neonatal/,
    /^Early neonatal/,
    /^Late neonatal/,
    /^Infant/,
    /^Child/,
    /^Under-5/,
  ])
    await groups.getByRole("checkbox", { name }).uncheck();
  await u5.getByRole("button", { name: "Save Under-five mortality" }).click();
  await expect(u5.getByRole("status")).toHaveText("Saved.");
  expect(api.settingsWrites.at(-1)).toEqual({
    path: "KE/under_5_mortality",
    body: expect.objectContaining({
      selectors: ["postneonatal"],
      default_selector: "postneonatal",
    }),
  });

  await page.goto(
    "/dashboard/geo-ke?admin_unit=geo-ke-kajiado&outcome=under_5_mortality",
  );
  expect(await optionsOf(page, "Age group")).toEqual(["Post-neonatal (1-11 months)"]);
});

test("a refused save shows the reason and keeps the saved settings", async ({
  page,
}) => {
  const api = await installKenya(page, true, ["/kenya"], admin);
  await page.goto("/settings");

  const lbw = settingsFor(page, "Low birth weight");
  await lbw
    .getByRole("group", { name: "Pregnancy windows" })
    .getByRole("checkbox", { name: /Whole pregnancy/ })
    .uncheck();
  await lbw.getByRole("button", { name: "Save Low birth weight" }).click();
  await expect(lbw.getByRole("alert")).toHaveText(
    "Keep at least one option switched on in each list for every view.",
  );
  expect(api.settingsWrites.at(-1)?.body.selectors).toEqual([]);
  await page.screenshot({
    path: "../outputs/e2e/web/model-settings-refused.png",
    fullPage: true,
  });

  // Nothing was stored: the dashboard still offers the whole pregnancy.
  await page.goto("/dashboard/geo-ke?admin_unit=geo-ke-kajiado&outcome=lbw");
  expect(await optionsOf(page, "Pregnancy window")).toEqual([
    "Whole pregnancy (lags 0-8)",
  ]);
});

test("countries outside the user's scope are not listed", async ({ page }) => {
  await installKenya(page, true, ["/india"], admin);
  await page.goto("/settings");
  await expect(
    page.getByText("No model is installed for the countries you can see."),
  ).toBeVisible();
  await expect(page.getByRole("group", { name: "Low birth weight" })).toHaveCount(0);
});

test("any signed-in planner can change model settings, without the admin cards", async ({
  page,
}) => {
  await installKenya(page, true, ["/kenya"], { roles: ["health_planning_lead"] });
  await page.goto("/settings");

  const lbw = settingsFor(page, "Low birth weight");
  await expect(lbw).toBeVisible();
  // Installation administration stays with admins: no tabs, no admin cards.
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect(page.getByText("Climate data", { exact: true })).toHaveCount(0);

  const windows = lbw.getByRole("group", { name: "Pregnancy windows" });
  await windows.getByRole("checkbox", { name: /1st trimester/ }).check();
  const saved = page.waitForRequest(
    (request) =>
      request.method() === "PUT" && request.url().endsWith("/model-settings/KE/lbw"),
  );
  await lbw.getByRole("button", { name: "Save Low birth weight" }).click();
  expect((await saved).postDataJSON().selectors).toEqual(["P", "T1"]);
  await page.screenshot({
    path: "../outputs/e2e/web/model-settings-planner.png",
    fullPage: true,
  });
});
