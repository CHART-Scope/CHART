import { expect, test } from "@playwright/test";

import { json } from "./support/fakeApi";
import { fixtures, installKenya } from "./support/kenya";

// Phones and tablets people actually use, portrait and landscape.
const DEVICES = [
  { name: "iphone-se", width: 375, height: 667 },
  { name: "iphone-14", width: 390, height: 844 },
  { name: "pixel-7", width: 412, height: 915 },
  { name: "ipad-mini", width: 768, height: 1024 },
  { name: "ipad-air", width: 820, height: 1180 },
  { name: "ipad-landscape", width: 1024, height: 768 },
] as const;

const MONTHS = ["2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"];

for (const device of DEVICES) {
  test(`Explore works on ${device.name} (${device.width}×${device.height})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: device.width, height: device.height });
    await page.route("https://tiles.openfreemap.org/**", (route) => route.abort());
    const api = await installKenya(page);
    api.on(/^\/api\/chart\/heat-outlook\/geo-ke\/forecast\/map$/, (route, url) =>
      json(route, {
        ...fixtures.mapFrame,
        outcome: "lbw",
        month: url.searchParams.get("month") ?? MONTHS[0],
        metric: "heat_attributable_share_forecast_month",
        issue: "2026-10",
        months: MONTHS,
        ranges: {},
        tmax_c: {},
        areas: fixtures.mapFrame.areas.map((area, index) => ({
          ...area,
          value_percent: 10 + (index % 5),
          missing_reason: null,
        })),
      }),
    );
    api.on(/^\/api\/chart\/heat-outlook\/geo-ke-kajiado\/forecast$/, (route) =>
      json(route, {
        geography_id: "geo-ke-kajiado",
        outcome: "lbw",
        issue: "2026-10",
        selector: "P",
        selectors: ["P"],
        systems: ["ecmwf 51", "ukmo 610", "dwd 22"],
        source: "Copernicus C3S multi-system seasonal forecast",
        source_uri:
          "https://cds.climate.copernicus.eu/datasets/seasonal-postprocessed-single-levels",
        method: "normal plus anomaly",
        months: MONTHS.map((month, index) => ({
          month,
          tmax_c: 28 + index / 2,
          tmax_low_c: 27.5 + index / 2,
          tmax_high_c: 28.6 + index / 2,
          value_percent: 12 + index,
          low_percent: 9 + index,
          high_percent: 15 + index,
        })),
      }),
    );
    await page.goto("/explore?frame=geo-ke&place=geo-ke-kajiado&outcome=lbw");
    await expect(page.getByTestId("explore-estimate")).toBeVisible();

    const stacked = device.width <= 860;
    const fits = () =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    expect(await fits()).toBe(true);

    // The map takes a real share of the screen, and its legend stays small.
    const map = (await page.getByTestId("explore-map").boundingBox())!;
    const legend = (await page.getByTestId("explore-legend").boundingBox())!;
    expect(map.height).toBeGreaterThanOrEqual(stacked ? 300 : device.height * 0.6);
    expect(legend.height).toBeLessThanOrEqual(map.height * 0.3);
    expect(legend.x + legend.width).toBeLessThanOrEqual(map.x + map.width);

    // Stacked: the panel spans the screen under the map and the page scrolls
    // to its end; side by side: the panel sits left of the map.
    const panel = (await page
      .getByRole("complementary", { name: "Explore controls" })
      .boundingBox())!;
    if (stacked) {
      expect(panel.y).toBeGreaterThanOrEqual(map.y + map.height - 1);
      expect(panel.width).toBeGreaterThanOrEqual(device.width - 1);
    } else {
      expect(panel.x + panel.width).toBeLessThanOrEqual(map.x + 1);
    }
    const act = page.getByRole("button", { name: "See actions" });
    await act.scrollIntoViewIfNeeded();
    await expect(act).toBeInViewport();

    // Layers switch with a tap; the forecast's months stay on one row.
    await page.getByRole("tab", { name: "Next 6 months" }).click();
    const picker = page
      .getByRole("group", { name: "Forecast month" })
      .getByRole("button");
    await expect(picker).toHaveCount(6);
    const rows = await picker.evaluateAll(
      (items) =>
        new Set(items.map((item) => Math.round(item.getBoundingClientRect().top))).size,
    );
    expect(rows).toBe(1);
    await picker
      .nth(1)
      .tap()
      .catch(() => picker.nth(1).click());
    await expect(page).toHaveURL(/view=forecast.*month=2026-11/);
    expect(await fits()).toBe(true);

    // Search opens a list that stays on screen.
    await page.getByRole("combobox").fill("Gar");
    const list = page.getByRole("listbox");
    await expect(list).toBeVisible();
    const listBox = (await list.boundingBox())!;
    expect(listBox.x).toBeGreaterThanOrEqual(0);
    expect(listBox.x + listBox.width).toBeLessThanOrEqual(device.width + 1);
    await page.keyboard.press("Escape");

    await page.screenshot({
      path: `../outputs/e2e/web/responsive-${device.name}.png`,
      fullPage: true,
    });
  });
}
