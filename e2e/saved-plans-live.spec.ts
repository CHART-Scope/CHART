import { expect, test } from "@playwright/test";

import { signInWithEmailCode as signIn } from "./emailCode";

const evidence = process.env.CHART_E2E_EVIDENCE!;

test("a planner saves a dashboard view, reads its recommendations and removes it", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("response", (response) => {
    if (response.url().includes("/api/chart/") && response.status() >= 500)
      failures.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  const name = `Kajiado heat plan ${Date.now()}`;
  await signIn(page, "kenya-planner");

  // Regression: the planning sentence named the domain "unspecified".
  await page.goto("/plan");
  const domain = page.getByRole("combobox", { name: "Choose the health domain" });
  await expect(domain).toContainText("Maternal, newborn and child health");
  await expect(page.locator("body")).not.toContainText(/unspecified/i);
  await expect(page.getByRole("heading", { name: "Saved plans" })).toBeVisible();

  await page.goto(
    "/dashboard/geo-ke-kajiado?outcome=lbw&view=projection&period=2027-2031",
  );
  const outlook = page.getByTestId("heat-outlook");
  await expect(outlook.getByTestId("outlook-estimate")).toContainText("%");
  const shown = await outlook.getByTestId("outlook-estimate").innerText();
  const save = outlook.getByRole("button", { name: "Save plan" });
  await expect(save).toBeEnabled();
  await save.click();

  const dialog = page.getByRole("dialog", {
    name: /Save this view as a plan|Plan saved/,
  });
  const field = dialog.getByLabel("Plan name");
  await expect(field).toHaveValue(/Low birth weight · Kajiado.* · Projected/);
  await field.fill("   ");
  await expect(dialog.getByRole("button", { name: "Save plan" })).toBeDisabled();
  await field.fill(name);
  await dialog.getByRole("button", { name: "Save plan" }).click();
  await expect(dialog.getByRole("status")).toContainText(
    `“${name}” is in your saved plans.`,
  );
  await page.screenshot({ path: `${evidence}/saved-plan-dialog.png` });

  await dialog.getByRole("link", { name: "See recommendations" }).click();
  await expect(page).toHaveURL(/\/dashboard\/geo-ke-kajiado\/actions\?.*plan=/);
  const panel = page.getByRole("region", { name: name });
  await expect(panel).toBeVisible();
  // The saved figure is the one the dashboard showed.
  const percent = shown.match(/(\d+\.\d)%/)?.[1];
  expect(percent).toBeTruthy();
  await expect(panel.getByTestId("plan-figure")).toContainText(`${percent}%`);
  await expect(panel.getByTestId("plan-figure")).toContainText("2027");
  const ranked = panel.getByRole("list", { name: "Recommended actions for this plan" });
  await expect(ranked.locator(":scope > li")).toHaveCount(3);
  await expect(
    page.getByRole("tab", { name: /Before heat season/, selected: true }),
  ).toBeVisible();
  const insight = panel.getByRole("complementary", { name: "AI insight" });
  await expect(insight).toContainText("Placeholder");
  await expect(insight).toContainText("not by an AI model");
  await expect(panel).toContainText("Ranked by season, outcome and cost rules.");
  // Ranked from the published feed for Kenya (e2e/fixtures/airtable_actions.json).
  await expect(ranked.getByRole("button").first()).toHaveText(
    "Counsel pregnant women on heat",
  );
  await expect(ranked.locator(":scope > li").first()).toContainText(
    "Targets low birth weight, this plan's outcome.",
  );
  // The action repository below: Kenya's actions, never India's or a Draft.
  const repository = page.getByRole("list", { name: "Before heat season actions" });
  await expect(repository).toContainText("County heat early warning");
  await expect(repository).not.toContainText("Act on IMD heat alerts");
  await expect(page.locator("body")).not.toContainText("Unreviewed draft action");
  const first = await ranked.getByRole("button").first().innerText();
  await ranked.getByRole("button").first().click();
  await expect(page).toHaveURL(/action=/);
  const detail = page.getByRole("dialog", { name: first });
  await expect(detail).toBeVisible();
  // Kenya's own wording replaces the generic stakeholders and description.
  await expect(detail.getByRole("region", { name: "Stakeholders" })).toContainText(
    "CHP",
  );
  await expect(detail.getByRole("region", { name: "Steps" })).toContainText(
    "Community health promoters counsel",
  );
  await expect(detail.getByRole("link", { name: /WHO heat guide/ })).toHaveAttribute(
    "href",
    "https://www.who.int/e2e-heat",
  );
  await page.reload();
  await expect(page.getByRole("region", { name: name })).toBeVisible();
  await page.screenshot({
    path: `${evidence}/saved-plan-recommendations.png`,
    fullPage: true,
  });

  await page.goto("/plan");
  const row = page.getByRole("listitem", { name: name });
  await expect(row).toContainText(`${percent}% attributable to heat`);
  await expect(row).toContainText("Before heat season");
  await row.getByRole("link", { name: "Open dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard\/geo-ke-kajiado\?/);
  await expect(page).toHaveURL(/period=2027-2031/);
  await expect(page).toHaveURL(/view=projection/);
  await expect(page.getByTestId("outlook-estimate")).toContainText(`${percent}%`);

  await page.goto("/plan");
  const again = page.getByRole("listitem", { name: name });
  await again.getByRole("button", { name: "Remove" }).click();
  await again.getByRole("button", { name: "Keep" }).click();
  await expect(again).toBeVisible();
  await again.getByRole("button", { name: "Remove" }).click();
  await again.getByRole("button", { name: `Confirm removing ${name}` }).click();
  await expect(page.getByRole("listitem", { name: name })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Saved plans" })).toBeVisible();
  await expect(page.getByRole("listitem", { name: name })).toHaveCount(0);

  // A removed or foreign plan link fails explicitly, not silently.
  await page.goto(
    "/dashboard/geo-ke/actions?outcome=lbw&plan=00000000-0000-4000-8000-000000000000",
  );
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "This plan no longer exists.",
  );
  await expect(
    page.getByRole("heading", { name: "Recommended actions", level: 1 }),
  ).toBeVisible();
  expect(failures).toEqual([]);
});

test("an administrator chooses the insight model from the provider's list", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signIn(page, "typography-admin");
  // Learning hub sits directly below Start planning.
  await expect(
    page.getByRole("navigation", { name: "Main" }).getByRole("link"),
  ).toHaveText(["Start planning", "Learning hub", "Settings"]);
  await page.goto("/settings?tab=recommendations");
  const card = page.getByRole("region", {
    name: "How actions are ranked and explained",
  });
  await expect(card).toContainText("Anthropic: Set ANTHROPIC_API_KEY");
  const provider = card.getByRole("combobox", { name: "Insight provider" });
  await provider.click();
  await page.getByRole("option", { name: "OpenAI or compatible server" }).click();
  const model = card.getByRole("combobox", { name: "Model" });
  await model.click();
  await expect(page.getByRole("option", { name: "stub-fail" })).toBeVisible();
  await page.getByRole("option", { name: "stub-small" }).click();
  await expect(card.getByText("Listed by the provider.")).toBeVisible();
  await card.getByRole("button", { name: "Save recommendation settings" }).click();
  await expect(card.getByRole("status")).toContainText("Saved.");
  await page.screenshot({ path: `${evidence}/recommendation-settings.png` });

  await page.reload();
  const reloaded = page.getByRole("region", {
    name: "How actions are ranked and explained",
  });
  await expect(reloaded.getByRole("combobox", { name: "Model" })).toContainText(
    "stub-small",
  );
  // Restore the installation default for the rest of the suite.
  await reloaded.getByRole("combobox", { name: "Insight provider" }).click();
  await page.getByRole("option", { name: "Template (no AI)" }).click();
  await reloaded.getByRole("button", { name: "Save recommendation settings" }).click();
  await expect(reloaded.getByRole("status")).toContainText("Saved.");
});
