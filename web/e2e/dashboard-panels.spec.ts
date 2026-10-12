import { expect, test } from "@playwright/test";

import { installFakeApi } from "./support/fakeApi";

// Outcome and place are chosen once, in the dashboard context bar. The panels
// below only echo those choices as bold text, so there is one place to change
// them and no second dropdown that can disagree with the first.
test("panels echo the context bar instead of offering their own dropdowns", async ({
  page,
}) => {
  await installFakeApi(page);
  await page.goto(
    "/dashboard/geo-in-mp?admin_unit=geo-in-mp-bhopal&outcome=lbw&month=2026-08",
  );

  const riskQuestion = page.getByRole("heading", { name: /How does extreme heat/ });
  const shareQuestion = page.getByRole("heading", { name: /What share of/ });
  await expect(riskQuestion.locator("strong")).toHaveText("low birth weight");
  await expect(shareQuestion.locator("strong")).toHaveText([
    "low birth weight",
    "Bhopal Division",
  ]);

  // The only outcome and place selectors on the page are the context bar's.
  await expect(page.getByRole("combobox", { name: "Health outcome" })).toHaveCount(1);
  await expect(page.getByRole("combobox", { name: "Risk estimate area" })).toHaveCount(
    0,
  );
  await expect(riskQuestion.getByRole("combobox")).toHaveCount(0);
  await expect(shareQuestion.getByRole("combobox")).toHaveCount(0);

  const context = page.getByRole("group", { name: "Dashboard context" });
  await context.getByRole("combobox", { name: "Health outcome", exact: true }).click();
  await page.getByRole("option", { name: "Under-five mortality", exact: true }).click();
  await page.waitForURL(/outcome=under_five_mortality/);
  await expect(riskQuestion.locator("strong")).toHaveText("under-five mortality");
  await expect(shareQuestion.locator("strong").first()).toHaveText(
    "under-five mortality",
  );

  await context.getByRole("combobox", { name: "Division", exact: true }).click();
  await page.getByRole("option", { name: "Gwalior Division", exact: true }).click();
  await page.waitForURL(/admin_unit=geo-in-mp-gwalior/);
  await expect(shareQuestion.locator("strong").last()).toHaveText("Gwalior Division");

  await page.screenshot({
    path: "../outputs/e2e/web/dashboard-panels.png",
    fullPage: true,
  });
});
