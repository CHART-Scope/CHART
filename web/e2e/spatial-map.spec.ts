import { expect, test } from "@playwright/test";

import { installFakeApi, json, mapFor } from "./support/fakeApi";

test("another month's map is marked stale and cannot queue runs", async ({ page }) => {
  const api = await installFakeApi(page);
  // Hold July's map until the test has looked at the in-between state.
  let releaseJuly: () => void = () => {};
  const julyHeld = new Promise<void>((resolve) => (releaseJuly = resolve));
  api.on(/^\/api\/chart\/risk\/[^/]+\/map$/, async (route, url) => {
    if (url.searchParams.get("month") === "2026-07") await julyHeld;
    return json(route, mapFor(url));
  });

  await page.goto(
    "/dashboard/geo-in-mp?admin_unit=geo-in-mp-bhopal&outcome=lbw&month=2026-08",
  );
  const calculate = page.getByRole("button", { name: /Calculate 1 more area/ });
  await expect(calculate).toBeVisible();
  await expect(page.getByText("Updating map…")).toHaveCount(0);

  await page
    .getByRole("group", { name: "Months in 2026" })
    .getByRole("button", { name: "Jul" })
    .click();

  // August's colours are still painted, so they must read as out of date.
  await expect(page.getByText("Updating map…")).toBeVisible();
  await expect(calculate).toHaveCount(0);

  releaseJuly();
  await expect(page.getByText("Updating map…")).toHaveCount(0);
  await expect(calculate).toBeVisible();
});

test("another outcome's map is marked stale while the new one loads", async ({
  page,
}) => {
  const api = await installFakeApi(page);
  let releaseUnderFive: () => void = () => {};
  const underFiveHeld = new Promise<void>((resolve) => (releaseUnderFive = resolve));
  api.on(/^\/api\/chart\/risk\/[^/]+\/map$/, async (route, url) => {
    if (url.searchParams.get("outcome") === "under_five_mortality") await underFiveHeld;
    return json(route, mapFor(url));
  });

  await page.goto(
    "/dashboard/geo-in-mp?admin_unit=geo-in-mp-bhopal&outcome=lbw&month=2026-08",
  );
  const calculate = page.getByRole("button", { name: /Calculate 1 more area/ });
  await expect(calculate).toBeVisible();

  await page
    .getByRole("group", { name: "Dashboard context" })
    .getByRole("combobox", { name: "Health outcome", exact: true })
    .click();
  await page.getByRole("option", { name: "Under-five mortality", exact: true }).click();

  // LBW's colours may still be painted; they must not pass as under-five's.
  await expect(page.getByText("Updating map…")).toBeVisible();
  await expect(calculate).toHaveCount(0);

  releaseUnderFive();
  await expect(page.getByText("Updating map…")).toHaveCount(0);
  await expect(calculate).toBeVisible();
});

test("returning to the dashboard on a new month does not pass off the old map", async ({
  page,
}) => {
  // Leaving the dashboard unmounts the map; coming back on another month
  // remounts it seeded from the last frame for this country, which holds
  // August's values while July's are fetched.
  const api = await installFakeApi(page);
  let releaseJuly: () => void = () => {};
  const julyHeld = new Promise<void>((resolve) => (releaseJuly = resolve));
  api.on(/^\/api\/chart\/risk\/[^/]+\/map$/, async (route, url) => {
    if (url.searchParams.get("month") === "2026-07") await julyHeld;
    return json(route, mapFor(url));
  });

  await page.goto(
    "/dashboard/geo-in-mp?admin_unit=geo-in-mp-bhopal&outcome=lbw&month=2026-08",
  );
  const calculate = page.getByRole("button", { name: /Calculate 1 more area/ });
  await expect(calculate).toBeVisible();

  await page.getByRole("link", { name: "Learning hub" }).click();
  await page.waitForURL("**/learning**");
  await page.evaluate(() =>
    (
      window as unknown as { next: { router: { push: (href: string) => void } } }
    ).next.router.push(
      "/dashboard/geo-in-mp?admin_unit=geo-in-mp-bhopal&outcome=lbw&month=2026-07",
    ),
  );
  await page.waitForURL("**month=2026-07**");

  await expect(page.getByText("Updating map…")).toBeVisible();
  await expect(calculate).toHaveCount(0);

  releaseJuly();
  await expect(page.getByText("Updating map…")).toHaveCount(0);
  await expect(calculate).toBeVisible();
});
