import { expect, test, type Page } from "@playwright/test";

import { installFakeApi } from "./support/fakeApi";
import { installKenya } from "./support/kenya";

// The Planning center (design frame 07): a two-choice sentence, hazard and
// health domain, with the roadmap's hazards and domains listed but disabled.
// Failure modes: a preselected choice, a selectable "coming soon" option, a
// button that starts before both choices, a division or random county as the
// starting place, and a dashboard link the dashboard cannot frame.

const sentence = (page: Page) => page.locator("form p").first();

async function options(page: Page, name: string) {
  await page.getByRole("combobox", { name, exact: true }).click();
  const listbox = page.getByRole("listbox");
  await expect(listbox).toBeVisible();
  const items = await listbox.getByRole("option").evaluateAll((nodes) =>
    nodes.map((node) => ({
      label: (node.textContent ?? "").replace("✓", "").trim(),
      disabled: node.getAttribute("aria-disabled") === "true",
    })),
  );
  return items;
}

test("India plans for Madhya Pradesh once a hazard and a domain are chosen", async ({
  page,
}, testInfo) => {
  const api = await installFakeApi(page);
  await page.goto("/plan");

  const title = page.getByRole("heading", {
    level: 1,
    name: "What would you like to plan for, together?",
  });
  await expect(title).toHaveCSS("font-family", /Fira/);
  await expect(title).toHaveCSS("font-weight", "600");
  await expect(sentence(page)).toContainText("in Madhya Pradesh.");
  await expect(page.getByText(/Bhopal|Gwalior/)).toHaveCount(0);
  // The sidebar is navigation only.
  await expect(page.getByText("Planning for")).toHaveCount(0);

  // Nothing is chosen for the planner, so nothing can start yet.
  const hazard = page.getByRole("combobox", { name: "Choose a climate hazard" });
  const domain = page.getByRole("combobox", { name: "Choose a health domain" });
  await expect(hazard).toContainText("choose a climate hazard");
  await expect(domain).toContainText("choose a health domain");
  // Two choices only: the outcome is picked on the dashboard.
  await expect(sentence(page).getByRole("combobox")).toHaveCount(2);
  const start = page.getByRole("button", { name: "Start planning together" });
  await expect(start).toBeDisabled();
  await expect(start).toHaveCSS("background-color", "rgb(185, 184, 242)");
  await expect(
    page.getByText("Choose a climate hazard and health domain to continue"),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("plan-empty.png"),
    fullPage: true,
  });

  expect(await options(page, "Choose a climate hazard")).toEqual([
    { label: "choose a climate hazard", disabled: true },
    { label: "Heat", disabled: false },
    { label: "Flooding (coming soon)", disabled: true },
    { label: "Air pollution (coming soon)", disabled: true },
  ]);
  // A coming-soon hazard cannot be chosen.
  await page
    .getByRole("option", { name: "Flooding (coming soon)" })
    .click({ force: true });
  await expect(hazard).toContainText("choose a climate hazard");
  await page.getByRole("option", { name: "Heat", exact: true }).click();
  await expect(hazard).toContainText("Heat");
  await expect(start).toBeDisabled();

  expect(await options(page, "Choose a health domain")).toEqual([
    { label: "choose a health domain", disabled: true },
    { label: "Maternal and child health", disabled: false },
    { label: "Vector-borne diseases (coming soon)", disabled: true },
    { label: "Heat-related illnesses (coming soon)", disabled: true },
    { label: "Non-communicable diseases (coming soon)", disabled: true },
  ]);
  await page.getByRole("option", { name: "Maternal and child health" }).click();
  await expect(
    page.getByText(
      "Ready — CHART will build the shared risk picture for this scenario.",
    ),
  ).toBeVisible();
  await expect(start).toBeEnabled();
  // Design system: the page's main action is Button L, solid nexus once enabled.
  await expect(start).toHaveCSS("height", "48px");
  await expect(start).toHaveCSS("background-color", "rgb(56, 62, 233)");
  await page.screenshot({
    path: "../outputs/e2e/web/planning-center.png",
    fullPage: true,
  });

  await start.click();
  await expect(page).toHaveURL(/\/dashboard\/geo-in-mp\?outcome=lbw$/);
  expect(api.unhandled).toEqual([]);
});

test("Kenya plans for Kajiado and opens its dashboard under Kenya", async ({
  page,
}) => {
  const api = await installKenya(page);
  await page.goto("/plan");

  await expect(sentence(page)).toContainText("in Kajiado.");
  await page.getByRole("combobox", { name: "Choose a climate hazard" }).click();
  await page.getByRole("option", { name: "Heat", exact: true }).click();
  await page.getByRole("combobox", { name: "Choose a health domain" }).click();
  await page.getByRole("option", { name: "Maternal and child health" }).click();
  await page.getByRole("button", { name: "Start planning together" }).click();
  await expect(page).toHaveURL(
    /\/dashboard\/geo-ke\?admin_unit=geo-ke-kajiado&outcome=lbw$/,
  );
  await expect(page.getByRole("combobox", { name: "County" })).toContainText("Kajiado");
  expect(api.unhandled).toEqual([]);
});

test("the planning sentence fits a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installFakeApi(page);
  await page.goto("/plan");
  await expect(sentence(page)).toContainText("in Madhya Pradesh.");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  await page.screenshot({
    path: "../outputs/e2e/web/planning-center-390.png",
    fullPage: true,
  });
});
