import { expect, test, type Locator } from "@playwright/test";

import { installFakeApi } from "./support/fakeApi";

// Failure modes: a top bar too thin to read, the brand icon back beside the
// wordmark, select carets hanging below their label (the old "⌄" glyph sat on
// the text baseline), a card boxing the place pickers, pickers stretched to
// fill the row, and the "Kenya · Hazard + Domain" summary row.

async function box(locator: Locator) {
  const rect = await locator.boundingBox();
  if (!rect) throw new Error("element is not visible");
  return rect;
}

test("dashboard chrome: tall top bar, centred carets, one uncarded row", async ({
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

  // One row, no card, every pill sized to its label with space left over.
  const names = ["State", "Division", "Climate hazard", "Health outcome"];
  const boxes = await Promise.all(
    names.map((name) => box(page.getByRole("combobox", { name, exact: true }))),
  );
  for (const [index, rect] of boxes.entries()) {
    expect(Math.abs(rect.y - boxes[0].y), `${names[index]} on the row`).toBeLessThan(1);
    expect(rect.width, `${names[index]} sized to its label`).toBeLessThan(300);
  }
  const bar = page.getByRole("group", { name: "Dashboard context" });
  const barBox = await box(bar);
  const last = boxes.at(-1)!;
  expect(barBox.x + barBox.width - (last.x + last.width)).toBeGreaterThan(200);
  const carded = await bar.evaluate(
    (node) =>
      [node, ...node.querySelectorAll("div")].filter((el) => {
        const style = getComputedStyle(el);
        return (
          style.borderTopWidth !== "0px" || style.backgroundColor !== "rgba(0, 0, 0, 0)"
        );
      }).length,
  );
  expect(carded, "no card around the pickers").toBe(0);

  await expect(page.getByTitle("Planning context")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toHaveCount(0);

  await page.screenshot({ path: "../outputs/e2e/web/dashboard-layout-1440.png" });
});

test("dashboard pickers wrap without sideways scroll on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installFakeApi(page);
  await page.goto("/dashboard/geo-in-mp?outcome=lbw");

  const outcome = page.getByRole("combobox", { name: "Health outcome", exact: true });
  await expect(outcome).toHaveText(/Low birth weight/);
  const hazard = await box(page.getByRole("combobox", { name: "Climate hazard" }));
  const outcomeBox = await box(outcome);
  expect(outcomeBox.y).toBeGreaterThanOrEqual(hazard.y);
  expect(outcomeBox.x + outcomeBox.width).toBeLessThanOrEqual(390);
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
