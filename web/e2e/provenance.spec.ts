import { expect, type Page, test } from "@playwright/test";

import { installFakeApi } from "./support/fakeApi";

const dashboard =
  "/dashboard/geo-in-mp?admin_unit=geo-in-mp-bhopal&outcome=lbw&month=2026-08";

/** August scored for Bhopal, with whatever provenance fields the API sent. */
async function openDetails(page: Page, provenance: Record<string, unknown> = {}) {
  await installFakeApi(page, {
    monthly: () => ({
      admin_unit_id: 1,
      admin_unit_code: "bhopal",
      months: {
        "2026-08": {
          temperature: {
            tmax_monthly_mean_c: 33.4,
            unit: "C",
            source_name: "ERA5",
            climate_run_id: 7,
            data_label: "reanalysis",
          },
          health_impacts: [],
          prediction: {
            request_id: 9,
            attributable_fraction_milli: 180,
            odds_ratio: 1.22,
            reference_temperature_c: 30,
            reference_kind: null,
            ci95_low: 1.05,
            ci95_high: 1.41,
            on_training_support: true,
            warning: null,
            model_version: "lbw-1.0.1",
            model_release_id: "lbw-1",
            model_file: "bhopal.rds",
            input_statistic: "tmax_monthly_mean_c",
            fraction_method: "attributable_fraction",
            attributable_fraction_policy: "positive_excess_only",
            ...provenance,
          },
        },
      },
    }),
  });
  await page.goto(dashboard);
  await page.getByText("Data and model details").click();
}

test("model details render when the API omits the event count", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // The shape an API deployed before the sample-size fields answers with: no
  // n_events, n_subjects or n_training at all.
  await openDetails(page);

  await expect(page.getByText("lbw-1.0.1").first()).toBeVisible();
  await expect(page.getByText("bhopal.rds")).toBeVisible();
  await expect(page.getByText("Events", { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("locally the model file used is the path on disk", async ({ page }) => {
  // What the API sends when it runs with CHART_SHOW_LOCAL_MODEL_PATH=1.
  const localPath = "/Users/planner/CHART/pipelines/models/india/mp/lbw/bhopal.rds";
  await openDetails(page, {
    model_runtime_path: localPath,
    model_artifact_uri: "s3://chart-predictive-models/india/mp/lbw/1.0.1/bhopal.rds",
  });

  const row = page.getByRole("definition").filter({ hasText: localPath });
  await expect(
    page.getByRole("term").filter({ hasText: "Model file used" }),
  ).toHaveCount(1);
  await expect(row).toBeVisible();
  // The S3 copy is not offered in its place.
  await expect(page.getByRole("link", { name: /s3:\/\// })).toHaveCount(0);
});

test("deployed the model file used links to its S3 object", async ({ page }) => {
  // A deployment sends no local path, only the published artifact.
  await openDetails(page, {
    model_runtime_path: null,
    model_artifact_uri: "s3://chart-predictive-models/india/mp/lbw/1.0.1/bhopal.rds",
  });

  await expect(
    page.getByRole("term").filter({ hasText: "Model file used" }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("link", {
      name: "s3://chart-predictive-models/india/mp/lbw/1.0.1/bhopal.rds",
    }),
  ).toHaveAttribute(
    "href",
    "https://chart-predictive-models.s3.amazonaws.com/india/mp/lbw/1.0.1/bhopal.rds",
  );
});
