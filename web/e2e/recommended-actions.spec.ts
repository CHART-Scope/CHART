import { expect, test, type Page } from "@playwright/test";

import { installFakeApi, json } from "./support/fakeApi";
import { actionList } from "./support/actions";

const actionsUrl =
  "/dashboard/geo-in-mp/actions?outcome=lbw&admin_unit=geo-in-mp-bhopal";

async function choose(page: Page, label: string, option: string) {
  await page
    .getByRole("group", { name: "Filter actions" })
    .getByRole("combobox", { name: label, exact: true })
    .click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

const cards = (page: Page) =>
  page.getByRole("list", { name: /actions$/ }).getByRole("button");
const panel = (page: Page) => page.getByRole("dialog");

test("see all opens the action repository for the same place and outcome", async ({
  page,
}) => {
  await installFakeApi(page);
  await page.goto("/dashboard/geo-in-mp?admin_unit=geo-in-mp-bhopal&outcome=lbw");

  await page.getByRole("link", { name: "See all recommended actions" }).click();
  await page.waitForURL(/\/dashboard\/geo-in-mp\/actions\?/);
  const url = new URL(page.url());
  expect(url.searchParams.get("admin_unit")).toBe("geo-in-mp-bhopal");
  expect(url.searchParams.get("outcome")).toBe("lbw");
  await expect(
    page.getByRole("heading", { name: "Recommended actions" }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Before heat season (2)" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(cards(page)).toHaveCount(2);
});

test("season tabs and filters narrow the list", async ({ page }) => {
  await installFakeApi(page);
  await page.goto(actionsUrl);

  await page.getByRole("tab", { name: /During heat season/ }).click();
  await expect(page).toHaveURL(/season=during/);
  await expect(cards(page)).toHaveCount(3);

  await choose(page, "Department", "Labour and occupational safety");
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText("Safe heat protocols");
  // Counts follow the filters, so an empty season is visible before it is opened.
  await expect(page.getByRole("tab", { name: "Before heat season (0)" })).toBeVisible();

  await choose(page, "Cost level", "Low");
  await expect(page.getByRole("status")).toHaveText(
    "No during heat season actions match these filters.",
  );

  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(cards(page)).toHaveCount(3);

  await page.screenshot({
    path: "../outputs/e2e/web/action-repository.png",
    fullPage: true,
  });
});

test("the detail panel jumps between sections and walks the filtered list", async ({
  page,
}) => {
  await installFakeApi(page);
  await page.goto(actionsUrl);

  await cards(page).first().click();
  await expect(page).toHaveURL(/action=recCounsel/);
  await expect(panel(page).getByRole("heading", { level: 2 })).toHaveText(
    "Provide pregnancy-specific heat health counselling to pregnant women",
  );

  const sections = panel(page).getByRole("navigation", { name: "Action sections" });
  await sections.getByRole("button", { name: "Evidence" }).click();
  await expect(sections.getByRole("button", { name: "Evidence" })).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(
    panel(page).getByRole("link", { name: /NRDC \(2024\)/ }),
  ).toBeInViewport();
  // A reference without a link is listed as plain text.
  await expect(panel(page).getByText("A citation without a link")).toBeVisible();
  await expect(panel(page).getByText("Case studies")).toBeVisible();

  // Curators' "1." lines render as a list.
  const steps = panel(page).getByRole("region", { name: "Steps" });
  await expect(steps.getByRole("listitem")).toHaveText([
    "Drink water often",
    "Rest in a shaded place",
  ]);
  await sections.getByRole("button", { name: "Stakeholders" }).click();
  await expect(panel(page).getByText("ASHA", { exact: true })).toBeVisible();

  // A reload keeps the panel open on the same action.
  await page.reload();
  await expect(panel(page).getByRole("heading", { level: 2 })).toContainText(
    "pregnancy-specific",
  );

  await panel(page).getByRole("button", { name: "Next action" }).click();
  await expect(panel(page).getByRole("heading", { level: 2 })).toContainText(
    "basic equipment and medicines",
  );
  await expect(page).toHaveURL(/action=recEquipment/);
  await panel(page).getByRole("button", { name: "Next action" }).click();
  await expect(panel(page).getByRole("heading", { level: 2 })).toContainText(
    "pregnancy-specific",
  );

  await page.screenshot({ path: "../outputs/e2e/web/actions-panel.png" });

  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/action=/);
  await expect(panel(page)).toBeHidden();
});

test("status persists and shows on the cards and the dashboard", async ({ page }) => {
  await installFakeApi(page);
  await page.goto(`${actionsUrl}&action=recCounsel`);

  await panel(page).getByRole("combobox", { name: "Action status" }).click();
  await page.getByRole("option", { name: "In progress", exact: true }).click();
  await page.keyboard.press("Escape");

  const card = cards(page).first();
  await expect(card).toContainText("In progress");

  await choose(page, "Status", "Not started");
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText("basic equipment");

  // The same place's dashboard list reads the same record.
  await page.goto("/dashboard/geo-in-mp?admin_unit=geo-in-mp-bhopal&outcome=lbw");
  await expect(
    page.getByRole("button", { name: /Open Provide pregnancy-specific/ }),
  ).toContainText("In progress");
});

test("actions that fail to load say so and can be retried", async ({ page }) => {
  const api = await installFakeApi(page);
  let calls = 0;
  api.on(/^\/api\/chart\/actions$/, (route) => {
    calls += 1;
    return calls === 1
      ? json(route, { error: "INTERNAL_ERROR" }, 500)
      : json(route, actionList);
  });
  await page.goto(actionsUrl);

  const alert = page.getByRole("main").getByRole("alert");
  await expect(alert).toContainText("Recommended actions could not be loaded.");
  await expect(cards(page)).toHaveCount(0);
  await alert.getByRole("button", { name: "Try again" }).click();
  await expect(alert).toBeHidden();
  await expect(cards(page)).toHaveCount(2);
});
