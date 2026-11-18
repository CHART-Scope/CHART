import { expect, test } from "@playwright/test";

import { signInWithEmailCode as signIn } from "./emailCode";

const evidence = process.env.CHART_E2E_EVIDENCE!;

// Configure plan, steps 1-2, through the real API, Keycloak and PostGIS:
// the draft the wizard starts is listed in the Planning center after a
// reload, with the dates and outcomes the planner chose.
test("a planner starts a plan in the wizard and finds the draft in the Planning center", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("response", (response) => {
    if (response.url().includes("/api/chart/") && response.status() >= 500)
      failures.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  const name = `Kajiado wizard plan ${Date.now()}`;
  await signIn(page, "kenya-planner");

  await page.goto("/dashboard/geo-ke?admin_unit=geo-ke-kajiado&outcome=lbw");
  await page
    .getByRole("group", { name: "Dashboard context" })
    .getByRole("link", { name: "Configure plan" })
    .click();
  await expect(page).toHaveURL(/\/dashboard\/geo-ke\/configure\?/);
  await page.getByLabel("Plan name").fill(name);
  await page
    .getByRole("group", { name: "Quick select" })
    .getByRole("button", { name: "Next 12 months" })
    .click();
  const start = await page.getByLabel("Start date").inputValue();
  const end = await page.getByLabel("End date").inputValue();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page).toHaveURL(/step=outcomes&?/);

  const outcomes = page.getByRole("group", { name: "Health outcomes" });
  await outcomes.getByRole("checkbox", { name: /Under-five mortality/ }).check();
  await page.screenshot({
    path: `${evidence}/configure-plan-outcomes.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page).toHaveURL(/step=districts/);

  // Step 3: Kajiado's areas ranked from the published map; keep one and save.
  // (Whether any reach the 5% suggestion line depends on the publication.)
  const first = page.getByRole("main").getByRole("checkbox").first();
  await expect(first).toBeVisible();
  await page.getByRole("button", { name: "Clear" }).click();
  await first.check();
  await page.screenshot({
    path: `${evidence}/configure-plan-districts.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page).toHaveURL(/step=actions/);

  // Step 4: Kenya's heat actions from the published feed, ranked; keep the
  // first, give it an owner, and save the plan.
  const action = page.getByRole("main").getByRole("checkbox").first();
  await expect(action).toBeVisible();
  if (!(await action.isChecked())) await action.check();
  await page.screenshot({
    path: `${evidence}/configure-plan-actions.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Save plan" }).click();
  await expect(page).toHaveURL(/\/plan$/);

  await page.reload();
  const row = page.getByRole("listitem", { name });
  await expect(row).not.toContainText("Draft");
  await row.getByRole("link", { name: "Edit plan" }).click();
  await page
    .getByRole("navigation", { name: "Plan steps" })
    .getByRole("button", { name: /Hazards/ })
    .click();
  await expect(
    page.getByRole("group", { name: "Health outcomes" }).getByRole("checkbox", {
      name: /Under-five mortality/,
    }),
  ).toBeChecked();
  await page
    .getByRole("navigation", { name: "Plan steps" })
    .getByRole("button", { name: /Timeline/ })
    .click();
  await expect(page.getByLabel("Start date")).toHaveValue(start);
  await expect(page.getByLabel("End date")).toHaveValue(end);
  await page
    .getByRole("navigation", { name: "Plan steps" })
    .getByRole("button", { name: /Districts/ })
    .click();
  await expect(page.getByRole("status").filter({ hasText: "selected" })).toHaveText(
    /^1 of \d+ selected$/,
  );

  await page.goto("/plan");
  const again = page.getByRole("listitem", { name });
  await again.getByRole("button", { name: "Remove" }).click();
  await again.getByRole("button", { name: `Confirm removing ${name}` }).click();
  await expect(page.getByRole("listitem", { name })).toHaveCount(0);
  expect(failures).toEqual([]);
});
