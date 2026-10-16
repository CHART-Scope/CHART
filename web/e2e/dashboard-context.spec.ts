import { expect, test } from "@playwright/test";

import { installFakeApi } from "./support/fakeApi";

async function choose(
  page: import("@playwright/test").Page,
  label: string,
  option: string,
) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("India has no country view: it opens on Madhya Pradesh", async ({ page }) => {
  // Madhya Pradesh has an LBW model but only division-level under-five models,
  // so under-five falls through to a division of the state.
  await installFakeApi(page);
  await page.goto("/dashboard/geo-in?outcome=under_five_mortality");

  await page.waitForURL(/\/dashboard\/geo-in-mp\?admin_unit=geo-in-mp-/);
  const state = page.getByRole("combobox", { name: "State", exact: true });
  await expect(state).toHaveText(/Madhya Pradesh/);
  await state.click();
  await expect(page.getByRole("option", { name: /All states/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  expect(new URL(page.url()).searchParams.get("outcome")).toBe("under_five_mortality");
});

test("an old link to a state in its country frame opens the state", async ({
  page,
}) => {
  await installFakeApi(page);
  await page.goto("/dashboard/geo-in?admin_unit=geo-in-mp&outcome=lbw");

  await page.waitForURL(/\/dashboard\/geo-in-mp\?outcome=lbw/);
  expect(new URL(page.url()).searchParams.get("admin_unit")).toBeNull();
  await expect(page.getByRole("combobox", { name: "State", exact: true })).toHaveText(
    /Madhya Pradesh/,
  );
  await expect(
    page.getByRole("combobox", { name: "Division", exact: true }),
  ).toHaveText(/Whole state/);

  // A division asked for in the old frame is kept.
  await page.goto("/dashboard/geo-in?admin_unit=geo-in-mp-gwalior&outcome=lbw");
  await page.waitForURL(/\/dashboard\/geo-in-mp\?admin_unit=geo-in-mp-gwalior/);
});

test("the state map and the division picker move together", async ({ page }) => {
  await installFakeApi(page);
  await page.goto("/dashboard/geo-in-mp?outcome=lbw&month=2026-08");
  const division = page.getByRole("combobox", { name: "Division", exact: true });
  await expect(division).toHaveText(/Whole state/);
  // The whole state is drawn, every division its own shape: no country map.
  await expect(page.locator("svg [data-interactive]").first()).toBeVisible();
  const shapes = await page.locator("svg path[data-interactive]").count();
  expect(shapes).toBeGreaterThanOrEqual(2);

  // Choosing a division on the map moves the picker.
  await page
    .getByRole("button", { name: /^Gwalior/ })
    .first()
    .click();
  await page.waitForURL(/admin_unit=geo-in-mp-gwalior/);
  await expect(division).toHaveText(/Gwalior/);
  await expect(page.locator('svg [data-selected="true"]')).toHaveCount(1);

  // Choosing in the picker moves the map's selection.
  await choose(page, "Division", "Bhopal Division");
  await page.waitForURL(/admin_unit=geo-in-mp-bhopal/);
  await expect(page.getByRole("button", { name: /^Bhopal/ }).first()).toHaveAttribute(
    "data-selected",
    "true",
  );

  // Back to the whole state, from the picker and from the map.
  await choose(page, "Division", "Whole state");
  await page.waitForURL((url) => !url.searchParams.has("admin_unit"));
  await expect(division).toHaveText(/Whole state/);
  await page
    .getByRole("button", { name: /^Gwalior/ })
    .first()
    .click();
  await page.waitForURL(/admin_unit=geo-in-mp-gwalior/);
  await page
    .getByRole("button", { name: /^Gwalior/ })
    .first()
    .click();
  await page.waitForURL((url) => !url.searchParams.has("admin_unit"));
  await page.screenshot({
    path: "../outputs/e2e/web/dashboard-state-map.png",
    fullPage: true,
  });
});
