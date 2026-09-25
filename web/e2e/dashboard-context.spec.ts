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

test("a state with no model for the outcome opens on its divisions", async ({
  page,
}) => {
  // Madhya Pradesh has an LBW model but only division-level under-five models.
  await installFakeApi(page);
  await page.goto("/dashboard/geo-in?outcome=under_five_mortality");
  await expect(page.getByRole("combobox", { name: "State", exact: true })).toHaveText(
    /All states/,
  );

  await choose(page, "State", "Madhya Pradesh");

  await page.waitForURL(/\/dashboard\/geo-in-mp\?/);
  await expect(page.getByRole("combobox", { name: "State", exact: true })).toHaveText(
    /Madhya Pradesh/,
  );
  await expect(
    page.getByRole("combobox", { name: "Division", exact: true }),
  ).toHaveText(/Division/);
  expect(new URL(page.url()).searchParams.get("outcome")).toBe("under_five_mortality");
});

test("a state shown in its country frame reads as the whole state", async ({
  page,
}) => {
  await installFakeApi(page);
  await page.goto("/dashboard/geo-in?admin_unit=geo-in-mp&outcome=lbw");

  await expect(page.getByRole("combobox", { name: "State", exact: true })).toHaveText(
    /Madhya Pradesh/,
  );
  await expect(
    page.getByRole("combobox", { name: "Division", exact: true }),
  ).toHaveText(/Whole state/);
});
