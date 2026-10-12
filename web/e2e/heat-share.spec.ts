import { expect, test, type Page } from "@playwright/test";

import { installFakeApi, json } from "./support/fakeApi";

/** One stored month for Bhopal, scored on the window `exposure` (newest first). */
async function openMonth(
  page: Page,
  month: string,
  prediction: {
    exposure: number[];
    oddsRatio: number;
    fractionMilli: number;
    reference: number;
    ci: [number, number];
    /** Dates of a daily model's series, newest first. */
    dates?: string[];
    outcome?: string;
  },
) {
  await installFakeApi(page, {
    monthly: () => ({
      admin_unit_id: 1,
      admin_unit_code: "bhopal",
      months: {
        [month]: {
          temperature: {
            tmax_monthly_mean_c: prediction.exposure[0],
            unit: "C",
            source_name: "ERA5",
            climate_run_id: 7,
            data_label: "reanalysis",
          },
          health_impacts: [],
          prediction: {
            request_id: 9,
            attributable_fraction_milli: prediction.fractionMilli,
            odds_ratio: prediction.oddsRatio,
            reference_temperature_c: prediction.reference,
            reference_kind: "p25",
            ci95_low: prediction.ci[0],
            ci95_high: prediction.ci[1],
            on_training_support: true,
            warning: null,
            model_version: "lbw-1.0.1",
            model_release_id: "lbw-1",
            model_file: "bhopal.rds",
            input_statistic: "tmax_monthly_mean_c",
            exposure_temperatures_c: prediction.exposure,
            exposure_dates: prediction.dates,
            n_training: prediction.dates ? 387 : 4210,
            n_events: prediction.dates ? 387 : 412,
          },
        },
      },
    }),
  });
  await page.goto(
    `/dashboard/geo-in-mp?admin_unit=geo-in-mp-bhopal&outcome=${prediction.outcome ?? "lbw"}&month=${month}`,
  );
}

test("a hot month with no share names the three months it was scored on", async ({
  page,
}) => {
  // Kajiado, January 2026, as stored: the hot November and December pull the
  // combined odds ratio below 1, so nothing is attributed.
  await openMonth(page, "2026-01", {
    exposure: [29.59, 28.62, 28.81],
    oddsRatio: 0.771,
    fractionMilli: 0,
    reference: 24.79,
    ci: [0.3, 2.95],
  });

  const stat = page.getByText(/At a maximum temperature of 29\.6°C in January 2026/);
  await expect(stat).toContainText("no attributable cases");
  await expect(stat).toContainText(
    "over the months it was calculated from the model finds no extra risk (odds ratio 0.77, range 0.30–2.95), and that range is too wide to tell either way",
  );
  // The old explanation blamed a downward curve that is not there.
  await expect(stat).not.toContainText("turns downward");
  await expect(
    page.getByText("Calculated from Nov–Jan: 28.8°C, 28.6°C, 29.6°C"),
  ).toBeVisible();

  await page.screenshot({ path: "../outputs/e2e/web/heat-share-zero.png" });
});

test("a month whose window stayed cool says so", async ({ page }) => {
  await openMonth(page, "2026-07", {
    exposure: [24.0, 23.1, 22.5],
    oddsRatio: 1.33,
    fractionMilli: 0,
    reference: 27,
    ci: [1.1, 1.6],
  });

  await expect(
    page.getByText(
      /the months it was calculated from stayed below the 27\.0°C reference/,
    ),
  ).toBeVisible();
});

test("a month with a share shows its window too", async ({ page }) => {
  await openMonth(page, "2026-08", {
    exposure: [26.91, 26.23, 26.09],
    oddsRatio: 1.075,
    fractionMilli: 70,
    reference: 24.79,
    ci: [0.9, 1.3],
  });

  await expect(page.getByText(/7% of low birth weight cases/)).toBeVisible();
  await expect(
    page.getByText("Calculated from Jun–Aug: 26.1°C, 26.2°C, 26.9°C"),
  ).toBeVisible();
});

test("under-five mortality is requested without a pregnancy window", async ({
  page,
}) => {
  // The model decides its windows. Naming window 1 made every under-five
  // request fail, because under-five models are fitted without one.
  const api = await installFakeApi(page);
  const bodies: Record<string, unknown>[] = [];
  api.on(/^\/api\/chart\/climate\/predict$/, (route) => {
    bodies.push(route.request().postDataJSON() as Record<string, unknown>);
    return json(route, { request_id: 1, status: "queued" }, 202);
  });

  await page.goto(
    "/dashboard/geo-in-mp?admin_unit=geo-in-mp-bhopal&outcome=under_five_mortality&month=2026-08",
  );
  await expect.poll(() => bodies.length).toBeGreaterThan(0);
  expect(bodies[0].outcome).toBe("under_five_mortality");
  expect(bodies[0]).not.toHaveProperty("pregnancy_windows");
  expect(bodies[0]).not.toHaveProperty("pregnancy_window");
});

test("an under-five month says it was scored day by day", async ({ page }) => {
  // August plus three lead-in days, newest first: 31 Aug back to 29 Jul.
  const dates = Array.from({ length: 34 }, (_, offset) =>
    new Date(Date.UTC(2026, 7, 31 - offset)).toISOString().slice(0, 10),
  );
  const exposure = dates.map((_, offset) => (offset < 5 ? 31 : 23));
  await openMonth(page, "2026-08", {
    exposure,
    dates,
    outcome: "under_five_mortality",
    oddsRatio: 1.33,
    fractionMilli: 248,
    reference: 27,
    ci: [1.1, 1.6],
  });

  await expect(
    page.getByText(
      "Calculated from each day of August, each scored on the 4 days ending that day: daily maximum 23.0–31.0°C",
    ),
  ).toBeVisible();

  await page.getByText("Data and model details").click();
  await expect(page.getByText(/34 daily maxima, 23\.0–31\.0°C/)).toBeVisible();
  // A mortality model's sample is its deaths.
  await expect(page.getByText("387 deaths")).toBeVisible();
});
