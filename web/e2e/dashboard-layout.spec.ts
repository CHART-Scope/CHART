import { expect, test, type Locator } from "@playwright/test";

import { installFakeApi } from "./support/fakeApi";

// Failure modes: a top bar too thin to read, the brand icon back beside the
// wordmark, select carets hanging below their label (the old "⌄" glyph sat on
// the text baseline), the hazard / outcome pickers squeezed into the place
// card, and the "Kenya · Hazard + Domain" summary row the pickers already say.

async function box(locator: Locator) {
  const rect = await locator.boundingBox();
  if (!rect) throw new Error("element is not visible");
  return rect;
}

test("dashboard chrome: tall top bar, centred carets, wide topic pickers", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installFakeApi(page);
  await page.goto("/dashboard/geo-in-mp?outcome=lbw");

  const outcome = page.getByRole("combobox", { name: "Health outcome", exact: true });
  await expect(outcome).toHaveText(/Low birth weight/);

  const topbar = page.getByRole("banner");
  expect((await box(topbar)).height).toBeGreaterThanOrEqual(63);
  const wordmark = topbar.getByText("CHART", { exact: true });
  await expect(wordmark).toBeVisible();
  await expect(wordmark.locator("svg")).toHaveCount(0);
  expect(
    await wordmark.evaluate((node) => parseFloat(getComputedStyle(node).fontSize)),
  ).toBeGreaterThanOrEqual(20);

  for (const name of ["State", "Division", "Climate hazard", "Health outcome"]) {
    const trigger = page.getByRole("combobox", { name, exact: true });
    const label = await box(trigger.locator("span").first());
    const caret = await box(trigger.locator("svg"));
    const labelMid = label.y + label.height / 2;
    const caretMid = caret.y + caret.height / 2;
    expect(Math.abs(labelMid - caretMid), `${name} caret centred`).toBeLessThanOrEqual(
      1,
    );
    const fontSize = await trigger.evaluate((node) =>
      parseFloat(getComputedStyle(node).fontSize),
    );
    expect(caret.height, `${name} caret sized to its text`).toBeCloseTo(fontSize, 0);
  }

  // Hazard and outcome sit outside the place card and span half the screen.
  const hazard = await box(page.getByRole("combobox", { name: "Climate hazard" }));
  const outcomeBox = await box(outcome);
  expect(outcomeBox.x + outcomeBox.width - hazard.x).toBeGreaterThanOrEqual(1440 / 2);
  expect(hazard.height).toBeGreaterThanOrEqual(46);
  const card = await box(
    page
      .getByRole("combobox", { name: "State", exact: true })
      .locator("xpath=ancestor::div[label][1]"),
  );
  expect(hazard.x).toBeGreaterThan(card.x + card.width);

  await expect(page.getByTitle("Planning context")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toHaveCount(0);

  await page.screenshot({ path: "../outputs/e2e/web/dashboard-layout-1440.png" });
});

test("dashboard topic pickers take the full row on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installFakeApi(page);
  await page.goto("/dashboard/geo-in-mp?outcome=lbw");

  const outcome = page.getByRole("combobox", { name: "Health outcome", exact: true });
  await expect(outcome).toHaveText(/Low birth weight/);
  const hazard = await box(page.getByRole("combobox", { name: "Climate hazard" }));
  const outcomeBox = await box(outcome);
  expect(outcomeBox.y).toBeGreaterThan(hazard.y + hazard.height);
  expect(hazard.width).toBeGreaterThanOrEqual(390 - 2 * 24);
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(390);

  await page.screenshot({ path: "../outputs/e2e/web/dashboard-layout-390.png" });
});

const pillStyle = (trigger: Locator) =>
  trigger.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      height: Math.round(node.getBoundingClientRect().height),
      fontSize: style.fontSize,
      fontFamily: style.fontFamily,
      fontWeight: style.fontWeight,
      borderRadius: style.borderRadius,
      background: style.backgroundColor,
      color: style.color,
    };
  });

test("every dashboard picker is the plan page's select pill", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installFakeApi(page);

  await page.goto("/plan");
  const planPill = page.getByRole("combobox", { name: "Choose the climate hazard" });
  await expect(planPill).toHaveText(/Heat/);
  const reference = await pillStyle(planPill);

  await page.goto("/dashboard/geo-in-mp?outcome=lbw");
  const outcome = page.getByRole("combobox", { name: "Health outcome", exact: true });
  await expect(outcome).toHaveText(/Low birth weight/);
  for (const name of ["State", "Division", "Climate hazard", "Health outcome"]) {
    const trigger = page.getByRole("combobox", { name, exact: true });
    expect(await pillStyle(trigger), name).toEqual(reference);
  }

  // Opening flips the caret, and choosing still navigates.
  const caret = outcome.locator("svg");
  await outcome.click();
  await expect(caret).toHaveCSS("transform", /matrix\(-1/);
  await page.getByRole("option", { name: "Under-five mortality" }).click();
  await page.waitForURL(/outcome=under_five_mortality/);
  await expect(outcome).toHaveText(/Under-five mortality/);
  await expect(caret).toHaveCSS("transform", "none");
});
