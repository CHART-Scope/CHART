import { expect, test } from "@playwright/test";

import { installFakeApi, json } from "./support/fakeApi";

// A new installation says on its front page how the first person gets in, so
// nobody needs server access to find the first admin login.

test("a new installation tells whoever deployed it how to sign in first", async ({
  page,
}) => {
  const api = await installFakeApi(page);
  api.on(/^\/api\/setup$/, (route) => json(route, { requiresOnboarding: true }));
  await page.goto("/");
  const hint = page.getByRole("note", { name: "First sign-in" });
  await expect(hint).toContainText("sign in as admin");
  await expect(hint).toContainText("CHART_ADMIN_INITIAL_PASSWORD");
  await expect(page.getByRole("button", { name: "Set up CHART" })).toBeVisible();
  await page.screenshot({ path: "../outputs/e2e/web/first-run-hint.png" });
});

test("once set up, the front page shows no first-run hint", async ({ page }) => {
  const api = await installFakeApi(page);
  api.on(/^\/api\/setup$/, (route) => json(route, { requiresOnboarding: false }));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("note", { name: "First sign-in" })).toHaveCount(0);
});
