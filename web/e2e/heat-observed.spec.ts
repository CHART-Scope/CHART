import { expect, test, type Page } from "@playwright/test";

import { installKenya, observedFixtures } from "./support/kenya";

// The Observed tab: a month of ERA5 scored with the modeller's DLNM by the
// Python API. The fake API serves responses captured from that API on the dev
// database (fixtures/observed-kenya.json), so the expected numbers are read
// from the same file rather than restated here.
type Estimate = {
  value_percent: number | null;
  low_percent: number | null;
  high_percent: number | null;
  message: string | null;
  ratio: { kind: string; value: number; low: number; high: number } | null;
};
type Observed = {
  month: string;
  available_months: string[];
  estimate: Estimate;
  inputs: { label: string }[];
  selectors: { code: string; label: string }[];
  calibration_note: string;
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const panel = (page: Page) => page.getByTestId("heat-outlook");
const observed = (key: string) => observedFixtures.observed[key] as unknown as Observed;
const label = (month: string) =>
  `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

test("Kenya LBW opens on the newest observed month, scored from ERA5", async ({
  page,
}) => {
  const latest = observed("geo-ke-kajiado|lbw|P|latest");
  const api = await installKenya(page);
  await page.goto("/dashboard/geo-ke?admin_unit=geo-ke-kajiado&outcome=lbw");

  const outlook = panel(page);
  await expect(outlook.getByRole("tab", { name: "Observed" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const estimate = outlook.getByTestId("outlook-estimate");
  const value = latest.estimate.value_percent;
  expect(value).not.toBeNull();
  await expect(estimate).toContainText(
    `${value!.toFixed(1)}% of low birth weight cases in Kajiado County may be attributed to heat in ${label(latest.month)}`,
  );
  await expect(estimate).toContainText(
    `(95% CI ${latest.estimate.low_percent!.toFixed(1)} to ${latest.estimate.high_percent!.toFixed(1)}%)`,
  );
  await expect(outlook.getByTestId("outlook-ratio")).toContainText(
    `Odds ratio ${latest.estimate.ratio!.value.toFixed(2)}`,
  );
  await expect(
    estimate.getByRole("button", { name: /High|Moderate|Low/ }),
  ).toBeVisible();
  if (Math.round(value!) > 0)
    await expect(
      outlook.getByRole("img", {
        name: `${Math.max(1, Math.round(value!))} of 100 newborn figures highlighted`,
      }),
    ).toBeVisible();

  // Only scoreable months can be picked; the newest is selected.
  const months = outlook.getByRole("group", { name: /Months in/ });
  const monthKey = latest.month;
  await expect(
    months.getByRole("button", {
      name: MONTHS[Number(monthKey.slice(5)) - 1],
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");

  // The temperatures behind it: nine months on both scales.
  await outlook.getByText("Temperatures behind this estimate").click();
  const inputs = outlook.getByRole("table", { name: "Temperatures used" });
  await expect(inputs.getByRole("row")).toHaveCount(1 + latest.inputs.length);
  await expect(inputs).toContainText(latest.inputs[0].label);
  await expect(outlook.getByText(latest.calibration_note)).toBeVisible();

  // The map shades the same month.
  expect(
    api.requests.some(
      (request) => request.includes("/observed/map") && request.includes("outcome=lbw"),
    ),
  ).toBe(true);
  await page.waitForTimeout(400);
  await page.screenshot({
    path: "../outputs/e2e/web/heat-observed-lbw.png",
    fullPage: true,
  });
  expect(api.unhandled).toEqual([]);
});

test("choosing another month moves the estimate and the map to it", async ({
  page,
}) => {
  const months = Object.keys(observedFixtures.observed)
    .filter((key) => key.startsWith("geo-ke-kajiado|lbw|P|") && !key.endsWith("latest"))
    .map((key) => key.split("|")[3]);
  const latest = observed("geo-ke-kajiado|lbw|P|latest");
  const other = months.find((month) => month !== latest.month)!;
  const body = observed(`geo-ke-kajiado|lbw|P|${other}`);
  const api = await installKenya(page);
  await page.goto("/dashboard/geo-ke?admin_unit=geo-ke-kajiado&outcome=lbw");
  const outlook = panel(page);
  await expect(outlook.getByTestId("outlook-estimate")).toContainText(
    label(latest.month),
  );

  if (other.slice(0, 4) !== latest.month.slice(0, 4)) {
    await outlook.getByRole("combobox", { name: "Year" }).click();
    await page.getByRole("option", { name: other.slice(0, 4), exact: true }).click();
  }
  await outlook
    .getByRole("group", { name: /Months in/ })
    .getByRole("button", { name: MONTHS[Number(other.slice(5)) - 1], exact: true })
    .click();

  await expect(outlook.getByTestId("outlook-estimate")).toContainText(label(other));
  if (body.estimate.value_percent !== null)
    await expect(outlook.getByTestId("outlook-estimate")).toContainText(
      `${body.estimate.value_percent.toFixed(1)}%`,
    );
  await expect
    .poll(() =>
      api.requests.some(
        (request) =>
          request.includes("/observed/map") && request.includes(`month=${other}`),
      ),
    )
    .toBe(true);
  // The figures dim while the next month loads, and settle when it arrives.
  await expect(outlook).toHaveAttribute("aria-busy", "false");
  expect(api.unhandled).toEqual([]);
});

test("Kenya under-five observed: post-neonatal by default, newborn deaths carry no heat excess", async ({
  page,
}) => {
  const latest = observed("geo-ke-kajiado|under_5_mortality|postneonatal|latest");
  const neonatal = observed("geo-ke-kajiado|under_5_mortality|neonatal|latest");
  await installKenya(page);
  await page.goto(
    "/dashboard/geo-ke?admin_unit=geo-ke-kajiado&outcome=under_5_mortality",
  );
  const outlook = panel(page);
  await expect(outlook.getByRole("combobox", { name: "Age group" })).toContainText(
    "Post-neonatal",
  );
  await expect(
    outlook.getByRole("note").filter({ hasText: "Approximate death dates." }),
  ).toBeVisible();
  const estimate = outlook.getByTestId("outlook-estimate");
  if (latest.estimate.value_percent !== null)
    await expect(estimate).toContainText(
      `${latest.estimate.value_percent.toFixed(1)}% of under-five mortality cases in Kajiado County`,
    );
  else await expect(estimate).toContainText(latest.estimate.message!);
  await expect(outlook.getByTestId("outlook-ratio")).toContainText("Risk ratio");

  await outlook.getByRole("combobox", { name: "Age group" }).click();
  await page.getByRole("option", { name: /^Neonatal/ }).click();
  await expect(estimate).toContainText(neonatal.estimate.message!);
  await expect(outlook.getByRole("img", { name: /of 100/ })).toHaveCount(0);
  await page.screenshot({
    path: "../outputs/e2e/web/heat-observed-u5.png",
    fullPage: true,
  });
});

test("switching the observed view off opens the dashboard on the projection", async ({
  page,
}) => {
  await installKenya(page, true, ["/kenya"], {
    settings: { lbw: { data_modes: ["projection"] } },
  });
  await page.goto("/dashboard/geo-ke?admin_unit=geo-ke-kajiado&outcome=lbw");
  const outlook = panel(page);
  await expect(outlook.getByRole("tab", { name: "Observed" })).toBeEnabled();
  await expect(outlook.getByRole("tab", { name: "Projected" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(outlook.getByTestId("outlook-estimate")).toContainText(
    "11.1% of low birth weight cases in Kajiado",
  );
  await outlook.getByRole("tab", { name: "Observed" }).click();
  await expect(outlook.getByRole("tab", { name: "Observed" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    outlook
      .getByRole("status")
      .filter({ hasText: "Observed estimates are not available" }),
  ).toBeVisible();
  await expect(outlook.getByTestId("outlook-estimate")).toHaveCount(0);
  await outlook.getByRole("tab", { name: "Projected" }).click();
  await expect(outlook.getByTestId("outlook-estimate")).toContainText("11.1%");
});

test("a failing observed request says so and leaves the projection usable", async ({
  page,
}) => {
  await installKenya(page, true, ["/kenya"], { observedStatus: 500 });
  await page.goto("/dashboard/geo-ke?admin_unit=geo-ke-kajiado&outcome=lbw");
  const outlook = panel(page);
  await expect(outlook.getByRole("tab", { name: "Observed" })).toBeEnabled();
  await expect(outlook.getByTestId("outlook-estimate")).toContainText("11.1%");
  await expect(outlook.getByRole("alert")).toHaveText(
    "Observed months could not load, so the projection is shown.",
  );
  await outlook.getByRole("tab", { name: "Observed" }).click();
  await expect(
    outlook
      .getByRole("alert")
      .filter({ hasText: "The observed estimate could not load." }),
  ).toBeVisible();
  await expect(outlook.getByTestId("outlook-estimate")).toHaveCount(0);
  await outlook.getByRole("tab", { name: "Projected" }).click();
  await expect(outlook.getByTestId("outlook-estimate")).toContainText("11.1%");
});

test("the projected peak heat season ranks months by share, not temperature", async ({
  page,
}) => {
  const api = await installKenya(page);
  await page.goto("/dashboard/geo-ke?admin_unit=geo-ke-kajiado&outcome=lbw");
  const outlook = panel(page);
  await outlook.getByRole("tab", { name: "Projected" }).click();

  const reference = outlook.getByRole("group", { name: "Reference period" });
  await reference.getByRole("button", { name: /Peak heat season \(Jul–Sep\)/ }).click();
  await expect(outlook.getByTestId("outlook-estimate")).toContainText(
    "in the peak heat season (Jul–Sep) of 2041–2060",
  );
  await expect(outlook.getByTestId("outlook-estimate")).toContainText(
    "climate-model range",
  );
  await expect
    .poll(() => api.requests.some((request) => request.includes("reference=peak")))
    .toBe(true);
  await page.waitForTimeout(400);
  await page.screenshot({
    path: "../outputs/e2e/web/heat-projected-peak.png",
    fullPage: true,
  });
});

test("the observed controls fit a phone screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await installKenya(page);
  await page.goto("/dashboard/geo-ke?admin_unit=geo-ke-kajiado&outcome=lbw");
  const outlook = panel(page);
  await expect(outlook.getByRole("group", { name: /Months in/ })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  await page.screenshot({
    path: "../outputs/e2e/web/heat-observed-phone.png",
    fullPage: true,
  });
});
