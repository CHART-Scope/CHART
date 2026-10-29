import { expect, test, type Page } from "@playwright/test";

const cases = [
  {
    country: "IN",
    username: "india-planner",
    frame: "geo-in-madhya-pradesh",
    frameName: "Madhya Pradesh",
    parent: "geo-in-madhya-pradesh-division-gwalior",
    parentName: "Gwalior",
    child: "geo-in-madhya-pradesh-district-gwalior",
    childName: "Gwalior",
    level: "District",
    aggregate: "All districts",
    frameLevel: "Division",
    frameAggregate: "All divisions",
  },
  {
    country: "KE",
    username: "kenya-planner",
    frame: "geo-ke",
    frameName: "Kenya",
    parent: "geo-ke-kajiado",
    parentName: "Kajiado",
    child: "geo-ke-constituency-kajiado-central",
    childName: "Kajiado Central",
    level: "Constituency",
    aggregate: "All constituencies",
    frameLevel: "County",
    frameAggregate: "All counties",
  },
];

async function expectRoute(
  page: Page,
  frame: string,
  filters: Record<string, string>,
  selected?: string,
) {
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === `/dashboard/${frame}` &&
      url.searchParams.get("admin_unit") === (selected ?? null) &&
      Object.entries(filters).every(
        ([key, value]) => url.searchParams.get(key) === value,
      ),
  );
}

function mapArea(page: Page, name: string) {
  return page.getByTestId("heat-outlook").getByRole("button", {
    name: new RegExp(`^${name}: `),
  });
}

async function goUp(page: Page, parent: string) {
  await page
    .getByRole("navigation", { name: "Map navigation", exact: true })
    .getByRole("button", { name: `Back to ${parent}`, exact: true })
    .click();
}

async function choosePlace(
  page: Page,
  level: string,
  option: string,
  screenshot?: string,
) {
  await page.getByRole("combobox", { name: level, exact: true }).click();
  const choice = page.getByRole("option", { name: option, exact: true });
  await expect(choice).toBeVisible();
  await expect(
    page.getByRole("option", { name: /^Whole (state|division|county|country)$/ }),
  ).toHaveCount(0);
  if (screenshot)
    await page.screenshot({
      path: `${process.env.CHART_E2E_EVIDENCE}/${screenshot}.png`,
      animations: "disabled",
    });
  await choice.click();
}

for (const place of cases) {
  for (const outcome of ["lbw", "under_5_mortality"]) {
    test(`${place.country} ${outcome}: map drilldown, parent return and history preserve both views`, async ({
      page,
    }) => {
      await page.goto("/auth/signin");
      await page.getByLabel("Email address").fill(place.username);
      await page
        .getByLabel("Password", { exact: true })
        .fill(process.env.CHART_E2E_PASSWORD!);
      await page.getByRole("button", { name: "Log in", exact: true }).click();
      await page.waitForURL(/\/(plan|dashboard)/);
      const filters = {
        outcome,
        view: "projection",
        month: "2026-09",
        scenario: "ssp126",
        period: "2027-2036",
        selector: outcome === "lbw" ? "P" : "neonatal",
        observed_selector: outcome === "lbw" ? "P" : "postneonatal",
        reference: "annual",
      };
      const query = new URLSearchParams(filters);
      await page.goto(`/dashboard/${place.frame}?${query}`);
      const panel = page.getByTestId("heat-outlook");
      const observed = panel.getByRole("tab", { name: "Observed", exact: true });
      const projected = panel.getByRole("tab", { name: "Projected", exact: true });
      await expect(projected).toHaveAttribute("aria-selected", "true");
      await expect(
        page.getByRole("combobox", { name: place.frameLevel, exact: true }),
      ).toContainText(place.frameAggregate);
      await mapArea(page, place.parentName).click();
      await expectRoute(page, place.parent, filters);
      await expect(
        page.getByRole("combobox", { name: place.level, exact: true }),
      ).toContainText(place.aggregate);
      await expect(mapArea(page, place.childName)).toBeVisible();
      const shapes = panel.locator('svg[role="group"] path[role="button"]');
      const shapeCount = await shapes.count();
      expect(shapeCount).toBeGreaterThan(1);
      await mapArea(page, place.childName).click();
      await expectRoute(page, place.parent, filters, place.child);
      await expect(panel.getByTestId("outlook-estimate")).toContainText(
        place.childName,
      );
      await expect(
        panel
          .getByRole("group", { name: "Scenario", exact: true })
          .getByRole("button", { name: "SSP1-2.6 (low emissions)", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      const selector = panel.getByRole("combobox", {
        name: outcome === "lbw" ? "Pregnancy window" : "Age group",
        exact: true,
      });
      await expect(selector).toContainText(
        outcome === "lbw" ? "Whole pregnancy" : "Neonatal (0-27 days)",
      );
      await expect(
        panel
          .getByRole("group", { name: "Period length", exact: true })
          .getByRole("button", { name: "10 years", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await page.reload();
      await expectRoute(page, place.parent, filters, place.child);
      await expect(projected).toHaveAttribute("aria-selected", "true");
      await expect(selector).toContainText(
        outcome === "lbw" ? "Whole pregnancy" : "Neonatal (0-27 days)",
      );
      await expect(panel.getByTestId("outlook-estimate")).toContainText(
        place.childName,
      );
      await page.goBack();
      await expectRoute(page, place.parent, filters);
      await page.goForward();
      await expectRoute(page, place.parent, filters, place.child);
      await choosePlace(
        page,
        place.level,
        place.aggregate,
        outcome === "lbw" ? `${place.country}-projection-aggregate-menu` : undefined,
      );
      await expectRoute(page, place.parent, filters);
      await expect(
        page.getByRole("combobox", { name: place.level, exact: true }),
      ).toContainText(place.aggregate);
      await expect(shapes).toHaveCount(shapeCount);
      await expect(panel.locator('svg path[data-selected="true"]')).toHaveCount(0);
      await expect(panel.getByTestId("outlook-estimate")).toBeVisible();
      await choosePlace(page, place.level, place.childName);
      await expectRoute(page, place.parent, filters, place.child);
      await goUp(page, place.parentName);
      await expectRoute(page, place.parent, filters);
      await goUp(page, place.frameName);
      await expectRoute(page, place.frame, filters);

      // Legacy non-leaf links resolve to their own map frame, retaining all choices.
      const observedFilters = { ...filters, view: "observed" };
      await page.goto(
        `/dashboard/${place.frame}?admin_unit=${place.parent}&${new URLSearchParams(observedFilters)}`,
      );
      await expectRoute(page, place.parent, observedFilters);
      await expect(observed).toHaveAttribute("aria-selected", "true");
      const parentResult = panel.getByTestId(
        place.country === "IN" ? "monthly-risk" : "outlook-estimate",
      );
      await expect(parentResult).toContainText(
        place.country === "IN" ? "September 2026" : "Sep 2026",
      );
      if (place.country === "IN") {
        await expect(parentResult).toContainText(outcome === "lbw" ? "20%" : "9%");
      }
      const parentSource = await panel.getByTestId("outlook-source").innerText();
      const childPolygon = mapArea(page, place.childName);
      await expect(childPolygon).not.toHaveAttribute(
        "aria-label",
        /\d.*% attributable/,
      );
      await childPolygon.click();
      await expectRoute(page, place.parent, observedFilters, place.child);
      await expect(observed).toHaveAttribute("aria-selected", "true");
      await expect(
        panel.getByRole("status").filter({ hasText: "No observed model is available" }),
      ).toBeVisible();
      await expect(panel.getByTestId("monthly-risk")).toHaveCount(0);
      await expect(panel.getByTestId("outlook-estimate")).toHaveCount(0);
      await expect(childPolygon).toBeVisible();
      await page.reload();
      await expectRoute(page, place.parent, observedFilters, place.child);
      await expect(observed).toHaveAttribute("aria-selected", "true");
      await expect(panel.getByTestId("outlook-estimate")).toHaveCount(0);
      await expect(
        panel.getByRole("status").filter({ hasText: "No observed model is available" }),
      ).toBeVisible();
      await page.screenshot({
        path: `${process.env.CHART_E2E_EVIDENCE}/${place.country}-${outcome}-observed-child.png`,
        fullPage: true,
      });
      await page.goBack();
      await expectRoute(page, place.parent, observedFilters);
      await expect(parentResult).toContainText(
        place.country === "IN" ? "September 2026" : "Sep 2026",
      );
      await expect(panel.getByTestId("outlook-source")).toHaveText(parentSource);
      await childPolygon.click();
      await expectRoute(page, place.parent, observedFilters, place.child);
      await choosePlace(
        page,
        place.level,
        place.aggregate,
        outcome === "lbw" ? `${place.country}-observed-aggregate-menu` : undefined,
      );
      await expectRoute(page, place.parent, observedFilters);
      await expect(
        page.getByRole("combobox", { name: place.level, exact: true }),
      ).toContainText(place.aggregate);
      await expect(shapes).toHaveCount(shapeCount);
      await expect(panel.locator('svg path[data-selected="true"]')).toHaveCount(0);
      await expect(parentResult).toContainText(
        place.country === "IN" ? "September 2026" : "Sep 2026",
      );
      await expect(panel.getByTestId("outlook-source")).toHaveText(parentSource);
      await choosePlace(page, place.level, place.childName);
      await expectRoute(page, place.parent, observedFilters, place.child);
      await goUp(page, place.parentName);
      await expectRoute(page, place.parent, observedFilters);
      await expect(parentResult).toContainText(
        place.country === "IN" ? "September 2026" : "Sep 2026",
      );
      await expect(panel.getByTestId("outlook-source")).toHaveText(parentSource);
      await projected.click();
      await expectRoute(page, place.parent, filters);
      await expect(selector).toContainText(
        outcome === "lbw" ? "Whole pregnancy" : "Neonatal (0-27 days)",
      );
      await expect(panel.getByTestId("outlook-estimate")).toBeVisible();
      await expect(panel.getByRole("alert")).toHaveCount(0);
    });
  }
}

test("district-only scope keeps its own route and outline in both views", async ({
  page,
}) => {
  const failures: string[] = [];
  page.on("response", (response) => {
    if (
      /\/api\/chart\/(heat-outlook|risk)\//.test(response.url()) &&
      response.status() >= 400
    )
      failures.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  await page.goto("/auth/signin");
  await page.getByLabel("Email address").fill("district-planner");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.CHART_E2E_PASSWORD!);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL(/\/(plan|dashboard)/);

  const district = "geo-in-madhya-pradesh-district-bhopal";
  const filters = { outcome: "lbw", view: "projection", month: "2026-09" };
  await page.goto(`/dashboard/${district}?${new URLSearchParams(filters)}`);
  const panel = page.getByTestId("heat-outlook");
  const areas = panel.locator('svg[role="group"] path[role="button"]');
  await expectRoute(page, district, filters);
  await expect(panel.getByTestId("outlook-estimate")).toContainText("Bhopal");
  await expect(areas).toHaveCount(1);
  await expect(areas).toHaveAttribute("aria-label", /^Bhopal: /);
  await expect(page.getByRole("navigation", { name: "Map navigation" })).toHaveCount(0);
  await areas.click();
  await expectRoute(page, district, filters);

  await panel.getByRole("tab", { name: "Observed", exact: true }).click();
  await expectRoute(page, district, { ...filters, view: "observed" });
  await expect(
    panel.getByRole("status").filter({ hasText: "No observed model is available" }),
  ).toBeVisible();
  await expect(areas).toHaveCount(1);
  await expect(areas).toHaveAttribute("aria-label", /^Bhopal: /);
  await expect(areas).not.toHaveAttribute("aria-label", /\d.*% attributable/);
  await expect(panel.getByTestId("outlook-estimate")).toHaveCount(0);
  await expect(panel.getByRole("alert")).toHaveCount(0);
  await page.reload();
  await expectRoute(page, district, { ...filters, view: "observed" });
  await expect(areas).toHaveCount(1);
  await panel.getByRole("tab", { name: "Projected", exact: true }).click();
  await expectRoute(page, district, filters);
  await expect(panel.getByTestId("outlook-estimate")).toContainText("Bhopal");
  await expect(areas).toHaveCount(1);
  await expect(page.getByRole("navigation", { name: "Map navigation" })).toHaveCount(0);
  expect(failures).toEqual([]);
  await page.screenshot({
    path: `${process.env.CHART_E2E_EVIDENCE}/district-only-navigation.png`,
    fullPage: true,
  });
});
