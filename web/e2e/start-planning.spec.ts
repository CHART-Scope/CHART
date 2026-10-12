import { expect, test } from "@playwright/test";

import { installFakeApi } from "./support/fakeApi";

test("start planning opens on the state, not a division", async ({ page }) => {
  // India's only modelled state is Madhya Pradesh, so planning starts there;
  // its divisions are chosen on the dashboard, not picked for the user.
  const api = await installFakeApi(page);
  await page.goto("/plan");

  await expect(page.getByText("in Madhya Pradesh.")).toBeVisible();
  await expect(page.getByText(/Bhopal|Gwalior/)).toHaveCount(0);
  // The sidebar is navigation only; the old "Planning for" block named a
  // place the user had not chosen.
  await expect(page.getByText("Planning for")).toHaveCount(0);

  await page.getByRole("button", { name: "Start planning together" }).click();
  await expect(page).toHaveURL(/\/dashboard\/geo-in-mp(\?|$)/);
  expect(api.unhandled).toEqual([]);
});
