import { expect, test, type Page } from "@playwright/test";

import { installFakeApi } from "./support/fakeApi";

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

test("see all opens the library for the same place and outcome", async ({ page }) => {
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
  await expect(page).toHaveURL(/season=During/);
  await expect(cards(page)).toHaveCount(3);

  await choose(page, "Department", "Labour");
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText("safe heat protocols");
  // Counts follow the filters, so an empty season is visible before it is opened.
  await expect(page.getByRole("tab", { name: "Before heat season (0)" })).toBeVisible();

  await choose(page, "Cost level", "Low");
  await expect(page.getByRole("status")).toHaveText(
    "No during heat season actions match these filters.",
  );

  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(cards(page)).toHaveCount(3);

  await page.screenshot({
    path: "../outputs/e2e/web/actions-library.png",
    fullPage: true,
  });
});

test("the detail panel jumps between sections and walks the filtered list", async ({
  page,
}) => {
  await installFakeApi(page);
  await page.goto(actionsUrl);

  await cards(page).first().click();
  await expect(page).toHaveURL(/action=recCounselling/);
  await expect(panel(page).getByRole("heading", { level: 2 })).toHaveText(
    "Provide pregnancy-specific health counselling to pregnant women",
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
  await expect(panel(page).getByText("Case studies")).toBeVisible();

  // Stakeholders written "Role — Example" show the example under the role.
  await sections.getByRole("button", { name: "Stakeholders" }).click();
  await expect(panel(page).getByText("India: ASHAs")).toBeVisible();

  // A reload keeps the panel open on the same action.
  await page.reload();
  await expect(panel(page).getByRole("heading", { level: 2 })).toContainText(
    "pregnancy-specific",
  );

  await panel(page).getByRole("button", { name: "Next action" }).click();
  await expect(panel(page).getByRole("heading", { level: 2 })).toContainText(
    "basic equipment and medicines",
  );
  await expect(page).toHaveURL(/action=recHospitalEquipment/);
  await panel(page).getByRole("button", { name: "Next action" }).click();
  await expect(panel(page).getByRole("heading", { level: 2 })).toContainText(
    "pregnancy-specific",
  );

  await page.screenshot({ path: "../outputs/e2e/web/actions-panel.png" });

  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/action=/);
  await expect(panel(page)).toBeHidden();
});

test("status and district assignments persist and show on the cards", async ({
  page,
}) => {
  await installFakeApi(page);
  await page.goto(`${actionsUrl}&action=recCounselling`);

  await panel(page).getByRole("combobox", { name: "Action status" }).click();
  await page.getByRole("option", { name: "In progress", exact: true }).click();

  // District chips explain their share of cases on demand.
  await panel(page).getByRole("button", { name: "Sheopur" }).click();
  await expect(panel(page).getByRole("status")).toContainText(
    "24.1% of low birth weight cases in Sheopur",
  );

  await panel(page).getByRole("button", { name: "Assign to districts →" }).click();
  const form = panel(page).getByRole("form", { name: "Assign to districts" });
  // Districts above 10% start ticked: Sheopur, Satna, Betul, Khargone, Panna, Damoh.
  await expect(form.getByRole("checkbox", { checked: true })).toHaveCount(6);
  await form.getByRole("checkbox", { name: /Damoh/ }).uncheck();
  await form.getByLabel("Assign to").selectOption("RCH Officer");
  await form.getByLabel("Due date").fill("2027-03-01");
  await form.getByRole("button", { name: "Assign to selected districts" }).click();

  await expect(
    panel(page).getByText(/Assigned to 5 districts · RCH Officer · Due 1 Mar 2027/),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  const card = cards(page).first();
  await expect(card).toContainText("In progress");
  await expect(card).toContainText("assigned to 5");

  await choose(page, "Status", "Not started");
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText("basic equipment");

  // The same place's dashboard list reads the same record.
  await page.goto("/dashboard/geo-in-mp?admin_unit=geo-in-mp-bhopal&outcome=lbw");
  await expect(
    page.getByRole("button", { name: /Open Provide pregnancy-specific/ }),
  ).toContainText("In progress");
});

test("a form with no districts ticked cannot be submitted", async ({ page }) => {
  await installFakeApi(page);
  await page.goto(`${actionsUrl}&action=recHospitalEquipment`);

  await panel(page).getByRole("button", { name: "Assign to districts →" }).click();
  const form = panel(page).getByRole("form", { name: "Assign to districts" });
  for (const box of await form.getByRole("checkbox").all()) await box.uncheck();
  await expect(form.getByText("Select at least one district to assign.")).toBeVisible();
  await expect(
    form.getByRole("button", { name: "Assign to selected districts" }),
  ).toBeDisabled();
});
