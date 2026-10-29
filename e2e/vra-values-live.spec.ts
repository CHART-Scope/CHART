import { readFileSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const frame = "geo-in-madhya-pradesh";
const evidence = process.env.CHART_E2E_EVIDENCE!;

// Templates contain quoted guidance with commas: keep the real downloaded CSV
// intact while filling only measured-value/source fields in this browser test.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index++;
      } else quoted = !quoted;
    } else if (!quoted && (char === "," || char === "\n")) {
      row.push(value.replace(/\r$/, ""));
      value = "";
      if (char === "\n") {
        rows.push(row);
        row = [];
      }
    } else value += char;
  }
  if (value || row.length) rows.push([...row, value]);
  return rows;
}

function csv(rows: string[][]) {
  return (
    rows
      .map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(","))
      .join("\n") + "\n"
  );
}

test("administrator stages and validates a CSV in the upload dialog, then sees recorded values separately from relative scores", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const failures: string[] = [];
  const uploads: string[] = [];
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname.endsWith(`/vra/${frame}/values`) &&
      request.method() === "POST"
    )
      uploads.push(request.url());
  });
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("response", (response) => {
    if (response.url().includes("/api/chart/vra/") && response.status() >= 500)
      failures.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  await page.goto("/auth/signin");
  await page.getByLabel("Email address").fill("typography-admin");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.CHART_E2E_PASSWORD!);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL(/\/(plan|dashboard)/);
  await page.goto(`/settings?tab=data&vra_frame=${frame}`);
  await expect(
    page.getByRole("heading", { name: "Indicator values per area", exact: true }),
  ).toBeVisible();
  const card = page.getByRole("region", {
    name: "Indicator values per area",
    exact: true,
  });
  await expect(card.getByRole("button", { name: "Download template" })).toHaveCount(0);
  await expect(card.getByText("CSV format and example", { exact: true })).toHaveCount(
    0,
  );
  const coverage = page.getByRole("table", {
    name: "Indicator coverage in Madhya Pradesh",
  });
  await coverage.getByRole("button", { name: /^Exposure/ }).click();
  const densityRow = coverage.getByRole("row", {
    name: "Population density",
    exact: true,
  });
  async function expectDensityCoverage(value: string) {
    const exposure = coverage.getByRole("button", { name: /^Exposure/ });
    if ((await exposure.getAttribute("aria-expanded")) !== "true")
      await exposure.click();
    await expect(densityRow.locator('[data-label="Areas"]')).toHaveText(value);
  }
  await expect(densityRow.locator('[data-label="Areas"]')).toHaveText("No data");
  await expect(densityRow.getByRole("button", { name: /Template/ })).toHaveCount(0);
  const opener = card.getByRole("button", { name: "Upload CSV", exact: true });
  const dialog = page.getByRole("dialog", { name: "Upload indicator values" });
  const template = dialog.getByRole("combobox", { name: "Template", exact: true });
  const file = dialog.getByLabel("CSV file", { exact: true });
  const validate = dialog.getByRole("button", {
    name: "Validate and upload",
    exact: true,
  });
  await opener.click();
  await expect(template).toBeFocused();
  await expect(template.locator("option:checked")).toHaveText("All indicators");
  await expect(validate).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await opener.click();

  const allDownload = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download template", exact: true }).click();
  const downloaded = await allDownload;
  await downloaded.saveAs(`${evidence}/vra-blank-template.csv`);
  const [header, ...rows] = parseCsv(
    readFileSync(`${evidence}/vra-blank-template.csv`, "utf8"),
  );
  expect(header).toEqual([
    "area_code",
    "area_name",
    "indicator_code",
    "value",
    "vintage",
    "source_name",
    "source_url",
    "notes",
    "indicator_name",
    "unit",
    "expected_values",
    "example_value",
  ]);
  expect(rows.length).toBeGreaterThan(100);
  expect(rows.every((row) => row[3] === "" && row[4] === "")).toBe(true);
  const areas = [...new Set(rows.map((row) => row[0]))];
  expect(areas).toHaveLength(10);
  await template.selectOption({ label: "Population density" });
  await expect(dialog).toContainText("persons/km²");
  await expect(dialog.getByRole("table", { name: "Template fields" })).toContainText(
    rows.find((row) => row[2] === "exp.population_density")![10],
  );
  const singleDownload = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download template", exact: true }).click();
  await (await singleDownload).saveAs(`${evidence}/vra-density-template.csv`);
  const [, ...densityRows] = parseCsv(
    readFileSync(`${evidence}/vra-density-template.csv`, "utf8"),
  );
  expect(densityRows).toHaveLength(10);
  expect(
    densityRows.every((row) => row[2] === "exp.population_density" && row[3] === ""),
  ).toBe(true);
  await expect(validate).toBeInViewport({ ratio: 1 });
  await dialog.screenshot({ path: `${evidence}/vra-upload-dialog-desktop.png` });

  const stagedDensity = densityRows[0].slice();
  stagedDensity[3] = "100";
  stagedDensity[4] = "2026-browser-e2e";
  const stagedFile = {
    name: "cancelled-density.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv([header, stagedDensity])),
  };
  await file.setInputFiles(stagedFile);
  await expect(validate).toBeEnabled();
  expect(uploads).toHaveLength(0);
  await template.selectOption({ label: "All indicators" });
  await expect(file).toHaveValue("");
  await expect(validate).toBeDisabled();
  await file.setInputFiles(stagedFile);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await page.reload();
  await expect(card.getByText("Nothing uploaded for this place yet.")).toBeVisible();
  expect(uploads).toHaveLength(0);

  // The same native dialog fits a phone and keeps keyboard focus inside it.
  const desktop = page.viewportSize()!;
  await page.setViewportSize({ width: 390, height: 844 });
  await opener.click();
  await expect(template).toBeFocused();
  await template.selectOption({ label: "Population density" });
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "Close", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(template).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
  expect(
    await dialog.evaluate((element) => element.scrollWidth - element.clientWidth),
  ).toBeLessThanOrEqual(0);
  const mobileBox = await dialog.boundingBox();
  expect(mobileBox).not.toBeNull();
  expect(mobileBox!.x).toBeGreaterThanOrEqual(0);
  expect(mobileBox!.x + mobileBox!.width).toBeLessThanOrEqual(390);
  await expect(validate).toBeInViewport({ ratio: 1 });
  await dialog.screenshot({ path: `${evidence}/vra-upload-dialog-mobile.png` });
  await file.setInputFiles(stagedFile);
  await dialog.getByRole("button", { name: "Close", exact: true }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(validate).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "Close", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect(uploads).toHaveLength(0);
  await page.setViewportSize(desktop);
  await opener.click();

  async function submit() {
    const response = page.waitForResponse(
      (item) =>
        new URL(item.url()).pathname.endsWith(`/vra/${frame}/values`) &&
        item.request().method() === "POST",
    );
    await validate.click();
    const result = await response;
    await expect(file).toHaveValue("");
    await expect(validate).toBeDisabled();
    await expect(dialog).toBeVisible();
    return result;
  }

  // A chosen indicator cannot silently accept a different indicator's CSV.
  const invalid = rows.find((row) => row[2] === "sens.elderly_share")!.slice();
  invalid[3] = "12";
  invalid[4] = "2026-browser-e2e";
  await template.selectOption({ label: "Population density" });
  await file.setInputFiles({
    name: "wrong-indicator.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv([header, invalid])),
  });
  const mismatch = await submit();
  expect(new URL(mismatch.url()).searchParams.get("indicator_code")).toBe(
    "exp.population_density",
  );
  expect(mismatch.status()).toBe(200);
  await expect(dialog.getByRole("alert")).toContainText("was not loaded");
  await expect(dialog.getByRole("list", { name: "Rejected rows" })).toContainText(
    "exp.population_density",
  );
  await template.selectOption({ label: "All indicators" });
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(dialog.getByRole("list", { name: "Rejected rows" })).toHaveCount(0);

  await file.setInputFiles({
    name: "invalid-header.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("area_code,value\nwrong,1\n"),
  });
  expect((await submit()).status()).toBe(422);
  await expect(dialog.getByRole("alert")).toContainText("Row 1:");
  await expect(dialog.getByRole("alert")).toContainText("missing required columns");
  invalid[3] = "101";
  await file.setInputFiles({
    name: "invalid-share.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv([header, invalid])),
  });
  expect((await submit()).status()).toBe(200);
  await expect(dialog.getByRole("alert")).toContainText("was not loaded");
  await expect(dialog.getByRole("list", { name: "Rejected rows" })).toContainText(
    "Row 2",
  );
  await expect(dialog.getByRole("list", { name: "Rejected rows" })).toContainText(
    "expected",
  );
  await expect(dialog.getByRole("list", { name: "Rejected rows" })).toContainText(
    "100",
  );
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expectDensityCoverage("No data");
  await opener.click();

  const series: Record<string, number[]> = {
    "exp.population_density": [100, 100.5, 200, 300],
    "sens.elderly_share": [0, 10, 20, 30],
    "haz.flood_events": [0.5, 1.5, 2.5, 3.5],
    "ac.heat_action_plan": [0, 1, 0, 1],
    "exp.workers_share": [0.003],
  };
  const filled = rows
    .filter((row) => row[2] in series)
    .map((row) => {
      const value = series[row[2]][areas.indexOf(row[0])];
      const next = row.slice();
      if (value !== undefined) {
        next[3] = String(value);
        next[4] = "2026-browser-e2e";
        next[5] = "Synthetic browser data";
      }
      return next;
    });
  const validFile = {
    name: "synthetic-valid.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv([header, ...filled])),
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    await file.setInputFiles(validFile);
    const accepted = await submit();
    expect(accepted.status()).toBe(200);
    expect(new URL(accepted.url()).searchParams.has("indicator_code")).toBe(false);
    await expect(
      dialog.getByRole("status").filter({ hasText: "synthetic-valid.csv:" }),
    ).toHaveText("synthetic-valid.csv: 17 rows accepted, 0 rejected.");
  }
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expectDensityCoverage("4 of 10");
  await page.reload();
  await expectDensityCoverage("4 of 10");
  expect(uploads).toHaveLength(5);
  const runResponse = page.waitForResponse(
    (response) =>
      response.url().includes(`/vra/${frame}/runs`) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Run assessment", exact: true }).click();
  const run = await runResponse;
  expect(run.status()).toBe(200);
  const assessment = await run.json();
  await expect(
    page.getByRole("status").filter({ hasText: "Assessment run:" }),
  ).toContainText("4 of 10 divisions scored");
  await page
    .getByRole("link", { name: "Open the vulnerability map for Madhya Pradesh" })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Vulnerability across Madhya Pradesh",
      exact: true,
    }),
  ).toBeVisible();
  const area = (code: string) =>
    assessment.areas.find((item: { code: string }) => item.code === code);
  await page.goto(`/vulnerability/${frame}?area=${area(areas[0]).geography_id}`);
  const table = page.getByRole("table", {
    name: `Indicators for ${area(areas[0]).name}`,
    exact: true,
  });
  await expect(
    table.getByRole("columnheader", { name: "Recorded value", exact: true }),
  ).toBeVisible();
  await expect(
    table.getByRole("columnheader", { name: "Relative score", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/its recorded value can still be above zero/),
  ).toBeVisible();
  const density = table.getByRole("row", { name: "Population density", exact: true });
  await expect(density.locator('[data-label="Recorded value"]')).toHaveText(
    "100 persons/km²",
  );
  await expect(density.locator('[data-label="Relative score"]')).toHaveText("0.00");
  const elderlyName = rows.find((row) => row[2] === "sens.elderly_share")![8];
  const elderly = table.getByRole("row", { name: elderlyName, exact: true });
  await expect(elderly.locator('[data-label="Recorded value"]')).toHaveText(/^0 %/);
  await expect(elderly.locator('[data-label="Relative score"]')).toHaveText("0.00");
  const workersName = rows.find((row) => row[2] === "exp.workers_share")![8];
  await expect(
    table
      .getByRole("row", { name: workersName, exact: true })
      .locator('[data-label="Recorded value"]'),
  ).toHaveText(/^0\.003 %/);
  await page.getByRole("button", { name: /Show \d+ indicators without data/ }).click();
  const missing = table.locator('tr[data-missing="true"]').first();
  await expect(missing.locator('[data-label="Recorded value"]')).toHaveText("Missing");
  await expect(missing.locator('[data-label="Relative score"]')).toHaveText(
    "Not scored",
  );
  await page.screenshot({
    path: `${evidence}/vra-recorded-and-relative.png`,
    fullPage: true,
  });
  await page.reload();
  await expect(density.locator('[data-label="Recorded value"]')).toHaveText(
    "100 persons/km²",
  );
  await page.goto(`/vulnerability/${frame}?area=${area(areas[1]).geography_id}`);
  await expect(
    page
      .getByRole("table", {
        name: `Indicators for ${area(areas[1]).name}`,
        exact: true,
      })
      .getByRole("row", { name: "Population density", exact: true })
      .locator('[data-label="Relative score"]'),
  ).toHaveText("<0.01");
  await page.goto(`/vulnerability/${frame}?area=${area(areas[4]).geography_id}`);
  await expect(
    page.getByRole("heading", { name: area(areas[4]).name, exact: true }),
  ).toBeVisible();
  await expect(page.getByText("No usable data", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Not scored", { exact: true }).first()).toBeVisible();
  expect(failures).toEqual([]);
  writeFileSync(
    `${evidence}/vra-browser-result.json`,
    JSON.stringify(
      {
        uploaded: 17,
        blankValuesSkipped: filled.length - 17,
        runId: assessment.run.id,
        scoredAreas: 4,
        totalAreas: 10,
        browserErrors: failures,
        uploadRequests: uploads.length,
        cancelledUploadRequests: 0,
      },
      null,
      2,
    ),
  );
});
