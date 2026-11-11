import { expect, test, type Page, type Route } from "@playwright/test";

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
  // The list view opens on every timeframe.
  await expect(page.getByRole("button", { name: "List", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("list", { name: "All actions" })).toBeVisible();
  await expect(cards(page)).toHaveCount(4);
});

test("the timeframe and other filters narrow the list", async ({ page }) => {
  await installFakeApi(page);
  await page.goto(actionsUrl);

  await choose(page, "Timeframe", "During heat season");
  await expect(page).toHaveURL(/season=during/);
  await expect(
    page.getByRole("list", { name: "During heat season actions" }),
  ).toBeVisible();
  await expect(cards(page)).toHaveCount(3);

  await choose(page, "Department", "Labour and occupational safety");
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText("Safe heat protocols");

  await choose(page, "Cost level", "Low");
  await expect(page.getByRole("status")).toHaveText("No actions match these filters.");

  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(cards(page)).toHaveCount(4);
  await expect(page).not.toHaveURL(/season=/);

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
  await panel(page).getByRole("button", { name: "Previous action" }).click();
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
  await expect(cards(page)).toHaveCount(3);
  await expect(cards(page).first()).toContainText("basic equipment");

  // The same place's dashboard list reads the same record.
  await page.goto("/dashboard/geo-in-mp?admin_unit=geo-in-mp-bhopal&outcome=lbw");
  await expect(
    page.getByRole("button", { name: /Open Provide pregnancy-specific/ }).first(),
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
  await expect(cards(page)).toHaveCount(4);
});

/** The heat-season calendar in effect for Bhopal (Settings > Heat seasons):
 * twelve letters from January, b before, d during, a after, o off. */
const heatSeason = (
  months: string,
  inheritedFrom: string | null = "Madhya Pradesh",
) => ({
  geography_id: "geo-in-mp-bhopal",
  name: "Bhopal",
  level_label: "Division",
  parent_id: "geo-in-mp",
  depth: 2,
  own: inheritedFrom ? null : months,
  months,
  state: inheritedFrom ? "inherited" : "custom",
  inherited_from: inheritedFrom,
  source: "IMD",
});
const seasonRoute = /^\/api\/chart\/heat-seasons\/geo-in-mp-bhopal$/;

const ganttCards = (page: Page) =>
  page.getByRole("list", { name: "Actions on the planning cycle" }).getByRole("button");

test("the Gantt chart lays actions on the place's planning cycle", async ({
  page,
}, testInfo) => {
  await page.clock.setFixedTime(new Date("2026-11-09T10:00:00"));
  const api = await installFakeApi(page);
  // India's March–June season with four months of preparation.
  api.on(seasonRoute, (route) => json(route, heatSeason("bbddddaaaabb")));
  await page.goto(actionsUrl);
  await page.getByRole("button", { name: "Gantt chart", exact: true }).click();
  await expect(page).toHaveURL(/view=gantt/);
  const chart = page.getByRole("region", { name: "Gantt chart" });
  await expect(
    chart.getByRole("list", { name: "Months" }).getByRole("listitem"),
  ).toHaveText([
    "Nov 2026",
    "Dec",
    "Jan 2027",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
  ]);
  await expect(chart.getByTestId("gantt-today")).toHaveText("9 Nov 2026");
  // The phases come from the place's calendar, editable in Settings.
  await expect(chart).toContainText(
    "4 months before the heat season, the heat season (March–June), and 4 months after.",
  );
  await expect(chart).toContainText(
    "Phases follow the Madhya Pradesh heat-season calendar",
  );
  await expect(
    chart.getByRole("link", { name: "Edit in Settings › Heat seasons" }),
  ).toHaveAttribute("href", "/settings?tab=seasons");
  for (const phase of [
    "Before heat season",
    "During heat season",
    "After heat season",
  ]) {
    await expect(chart.getByText(phase, { exact: true })).toBeVisible();
  }
  // Each card spans its seasons, earliest first.
  await expect(ganttCards(page)).toHaveCount(4);
  const names = await ganttCards(page).evaluateAll((buttons) =>
    buttons.map((button) => button.getAttribute("aria-label")),
  );
  expect(names).toEqual([
    "Ensure basic equipment and medicines for the heat season, Nov to Feb",
    "Provide pregnancy-specific heat health counselling to pregnant women, Nov to Jun",
    "Set up cool shelters in markets, Mar to Jun",
    "Safe heat protocols for pregnant workers, Mar to Oct",
  ]);
  const rows = page.getByRole("list", { name: "Actions on the planning cycle" });
  const track = (await rows.boundingBox())!;
  const shelter = (await ganttCards(page).nth(2).boundingBox())!;
  // Mar–Jun is columns 5–8 of 12 (cards keep a 10px gutter each side).
  expect((shelter.x - track.x - 10) / track.width).toBeCloseTo(4 / 12, 1);
  expect((shelter.width + 20) / track.width).toBeCloseTo(4 / 12, 1);
  await page.screenshot({ path: testInfo.outputPath("gantt.png"), fullPage: true });
  await page.screenshot({
    path: "../outputs/e2e/web/actions-gantt.png",
    fullPage: true,
  });

  // Filters apply to the chart too.
  await choose(page, "Department", "Labour and occupational safety");
  await expect(ganttCards(page)).toHaveCount(1);
  await page.getByRole("button", { name: "Clear filters" }).click();

  // A card opens the detail panel, and a reload keeps the chart and panel.
  await ganttCards(page).nth(2).click();
  await expect(page).toHaveURL(/action=/);
  await expect(panel(page).getByRole("heading", { level: 2 })).toHaveText(
    "Set up cool shelters in markets",
  );
  await page.reload();
  await expect(panel(page)).toBeVisible();
  await expect(chart).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page).not.toHaveURL(/view=/);
  await expect(cards(page)).toHaveCount(4);
  expect(api.unhandled).toEqual([]);
});

for (const [label, respond, first, shelterSpan] of [
  [
    "a season that wraps the year",
    (route: Route) => json(route, heatSeason("dddaaaaabbbb", null)),
    "Sep 2026",
    "Jan to Mar",
  ],
  [
    "a calendar that cannot load",
    (route: Route) => json(route, { error: "UPSTREAM_UNAVAILABLE" }, 503),
    "Nov 2026",
    "Mar to Jun",
  ],
] as const) {
  test(`the Gantt chart handles ${label}`, async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-11-09T10:00:00"));
    const api = await installFakeApi(page);
    api.on(seasonRoute, respond);
    await page.goto(`${actionsUrl}&view=gantt`);
    const months = page
      .getByRole("region", { name: "Gantt chart" })
      .getByRole("list", { name: "Months" })
      .getByRole("listitem");
    await expect(months.first()).toHaveText(first);
    await expect(
      ganttCards(page).filter({ hasText: "Set up cool shelters in markets" }),
    ).toHaveAttribute("aria-label", `Set up cool shelters in markets, ${shelterSpan}`);
    expect(api.unhandled).toEqual([]);
  });
}

test("the dashboard groups recommended actions by heat season", async ({ page }) => {
  await installFakeApi(page);
  await page.goto("/dashboard/geo-in-mp?admin_unit=geo-in-mp-bhopal&outcome=lbw");
  const panel = page.getByRole("region", { name: "Recommended actions" });
  for (const [season, titles] of [
    [
      "Before heat season",
      [
        "Provide pregnancy-specific heat health counselling to pregnant women",
        "Ensure basic equipment and medicines for the heat season",
      ],
    ],
    [
      "During heat season",
      [
        "Provide pregnancy-specific heat health counselling to pregnant women",
        "Safe heat protocols for pregnant workers",
        "Set up cool shelters in markets",
      ],
    ],
    ["After heat season", ["Safe heat protocols for pregnant workers"]],
  ] as const) {
    const column = panel.getByRole("region", { name: season });
    await expect(column.getByRole("heading", { level: 3 })).toHaveText(season);
    await expect(column.getByRole("button")).toHaveText(
      titles.map((title) => new RegExp(title)),
    );
  }
  await panel
    .getByRole("region", { name: "After heat season" })
    .getByRole("button")
    .click();
  await expect(page.getByRole("dialog").getByRole("heading", { level: 2 })).toHaveText(
    "Safe heat protocols for pregnant workers",
  );
  await page.keyboard.press("Escape");
  await panel.screenshot({
    path: "../outputs/e2e/web/dashboard-actions-by-season.png",
  });
});
