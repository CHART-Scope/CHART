import { expect, test } from "@playwright/test";

import { installFakeApi, json } from "./support/fakeApi";

test("returning to a month that is still preparing does not queue it again", async ({
  page,
}) => {
  const api = await installFakeApi(page);
  const submitted: string[] = [];
  api.on(/^\/api\/chart\/climate\/predict$/, (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    submitted.push(
      String(body.planning_date ?? body.planning_month ?? JSON.stringify(body)),
    );
    return json(route, { request_id: submitted.length, status: "queued" }, 202);
  });

  await page.goto(
    "/dashboard/geo-in-mp?admin_unit=geo-in-mp-bhopal&outcome=lbw&month=2026-08",
  );
  await expect.poll(() => submitted.length).toBe(1);

  const months = page.getByRole("group", { name: "Months in 2026" });
  await months.getByRole("button", { name: "Jul" }).click();
  await expect.poll(() => submitted.length).toBe(2);
  await months.getByRole("button", { name: "Aug" }).click();
  await expect(months.getByRole("button", { name: "Aug" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // Give a duplicate submission time to appear before asserting it did not.
  await page.waitForTimeout(1500);

  expect(submitted).toHaveLength(2);
  expect(new Set(submitted).size).toBe(2);
  // August's original request is being polled again rather than replaced.
  expect(
    api.requests.filter((r) => r.includes("/prediction-requests/1")).length,
  ).toBeGreaterThan(1);
});
