import { expect, test, type Page } from "@playwright/test";

import { json } from "./support/fakeApi";
import { installKenya, type KenyaApi } from "./support/kenya";

// Settings is split into tabs kept in `?tab=`. These specs drive the real
// Next build against the fake API: tab navigation and the URL, what a planner
// is denied, the one-row-per-country Data view, the Jobs list following a
// climate pull to the end on its own, a failed pull's reason and retry, and
// the phone layout. The fake climate service below holds its jobs in memory
// and moves them forward only when a test says so, so every status the page
// shows is one it fetched by itself.

const evidence = "../outputs/e2e/web/settings";
const admin = { roles: ["chart_admin", "health_planning_lead"] };
const tabs = ["Workspace", "Data", "Models", "Users", "Jobs"] as const;

type Job = {
  id: number;
  country_code: string;
  months: string[];
  status: "queued" | "running" | "completed" | "failed";
  stage: string;
  areas_total: number;
  areas_done: number;
  error_code: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

function country(code: string, name: string, total: number, withData: number) {
  return {
    country_code: code,
    name,
    areas_total: total,
    areas_with_data: withData,
    months: withData ? 10 : 0,
    earliest: withData ? "2025-11-01" : null,
    latest: withData ? "2026-08-01" : null,
    areas: [
      {
        geography_id: null,
        admin_unit_id: total,
        code: `${code}-1`,
        name: `${name} first area`,
        months: withData ? 10 : 0,
        earliest: null,
        latest: withData ? "2026-08-01" : null,
      },
    ],
  };
}

/** The climate endpoints, with jobs that advance only on `step()`. */
function fakeClimate(api: KenyaApi) {
  const jobs: Job[] = [];
  const posts: { country_code: string; months: string[] }[] = [];
  let keHeld = 0;
  const coverage = () => [
    country("IN", "India", 11, 11),
    country("KE", "Kenya", 4, keHeld),
  ];
  const stamp = () => new Date().toISOString();

  api.on(/^\/api\/chart\/climate\/coverage$/, (route) => json(route, coverage()));
  api.on(/^\/api\/chart\/climate\/ingestion-jobs$/, (route) => {
    if (route.request().method() === "GET") return json(route, jobs);
    const body = route.request().postDataJSON() as {
      country_code: string;
      months: string[];
    };
    posts.push(body);
    const job: Job = {
      id: jobs.length + 1,
      country_code: body.country_code,
      months: body.months.length ? body.months : ["2025-10", "2026-09"],
      status: "queued",
      stage: "queued",
      areas_total: 4,
      areas_done: 0,
      error_code: null,
      created_at: stamp(),
      updated_at: stamp(),
      completed_at: null,
    };
    jobs.unshift(job);
    return json(route, job, 202);
  });

  return {
    posts,
    /** Move the newest job on, as the Dagster worker would. */
    step(next: Partial<Job>) {
      Object.assign(jobs[0], next, { updated_at: stamp() });
      if (next.status === "completed") {
        jobs[0].completed_at = stamp();
        keHeld = 4;
      }
    },
  };
}

async function installAdmin(page: Page) {
  const api = await installKenya(page, true, ["/kenya", "/india"], admin);
  api.on(/^\/api\/admin\/users$/, (route) =>
    json(route, [
      {
        userId: "u1",
        username: "amina",
        email: "amina@example.org",
        displayName: "Amina Planner",
        status: "active",
        roles: ["health_planning_lead"],
        geographyScopes: [
          {
            geographyId: "geo-ke",
            path: "/kenya",
            name: "Kenya",
            levelLabel: "Country",
          },
        ],
      },
    ]),
  );
  api.on(/^\/api\/chart\/model-releases$/, (route) =>
    json(route, {
      items: [
        {
          id: "ke-lbw",
          version: "2.0.0",
          outcome: "lbw",
          outcome_label: "Low birth weight",
          climate_hazard: "heat",
          climate_hazard_label: "Heat",
          health_domain: null,
          health_domain_label: null,
          status: "active",
          activated_at: "2026-10-06T00:00:00Z",
          created_at: "2026-10-06T00:00:00Z",
          model_files: [],
          area_count: 47,
          manifest_source_path: "pipelines/models/lbw/model-release.ke.json",
          base_uri: null,
          source_git_ref: null,
          release_notes: null,
          is_active: true,
        },
      ],
    }),
  );
  return { api, climate: fakeClimate(api) };
}

// The Data tab holds more than one table (climate data, vulnerability
// indicators), so the climate table is found through its card.
const climateTable = (page: Page) =>
  page
    .getByRole("region", { name: "Observations held per country" })
    .getByRole("table");
const tabList = (page: Page) =>
  page.getByRole("tablist", { name: "Settings sections" });
const tab = (page: Page, name: string | RegExp) =>
  tabList(page).getByRole("tab", { name });

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test("tabs are kept in the URL, survive a reload and work from the keyboard", async ({
  page,
}) => {
  await installAdmin(page);
  await page.goto("/settings");
  await expect(tabList(page).getByRole("tab")).toHaveText([...tabs]);
  await expect(tab(page, "Workspace")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Planning location")).toBeVisible();

  await tab(page, "Data").click();
  await expect(page).toHaveURL(/\/settings\?tab=data$/);
  await expect(
    page.getByRole("heading", { name: "Observations held per country" }),
  ).toBeVisible();
  await expect(page.getByText("Planning location")).toHaveCount(0);

  await page.reload();
  await expect(tab(page, "Data")).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("heading", { name: "Observations held per country" }),
  ).toBeVisible();

  // Arrow keys move between tabs; Enter opens the focused one.
  await tab(page, "Data").focus();
  await page.keyboard.press("ArrowRight");
  await expect(tab(page, "Models")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\?tab=models$/);
  await expect(page.getByText("ke-lbw", { exact: true })).toBeVisible();
  await expect(page.getByText("1 active of 1 installed.")).toBeVisible();

  // The old model hub address opens the same tab.
  await page.goto("/settings/models");
  await expect(page).toHaveURL(/\/settings\?tab=models$/);
  await expect(tab(page, "Models")).toHaveAttribute("aria-selected", "true");

  // The reset is folded away at the foot of Users, never on show.
  await tab(page, "Users").click();
  await expect(page.getByText("Amina Planner")).toBeVisible();
  const reset = page.getByRole("button", { name: "Reset installation" });
  await expect(reset).toBeHidden();
  await page.getByText("Danger zone").click();
  await expect(reset).toBeVisible();

  // Workspace is the default, so it drops the parameter.
  await tab(page, "Workspace").click();
  await expect(page).toHaveURL(/\/settings$/);
});

test("a planner sees only Workspace and cannot open an admin tab by URL", async ({
  page,
}) => {
  const api = await installKenya(page, true, ["/kenya"], {
    roles: ["health_planning_lead"],
  });
  await page.goto("/settings?tab=jobs");
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByText("Planning location")).toBeVisible();
  await expect(page.getByRole("group", { name: "Low birth weight" })).toBeVisible();
  await expect(page.getByRole("tablist")).toHaveCount(0);
  for (const hidden of ["Running and recent work", "Observations held per country"])
    await expect(page.getByRole("heading", { name: hidden })).toHaveCount(0);

  await page.goto("/settings?tab=data");
  await expect(page).toHaveURL(/\/settings$/);
  // Nothing administrative was even asked for.
  expect(
    api.requests.filter((r) =>
      /ingestion-jobs|coverage|admin\/users|model-releases/.test(r),
    ),
  ).toEqual([]);
  await page.screenshot({
    path: `${evidence}/planner-workspace-desktop.png`,
    fullPage: true,
  });
});

test("each country appears once: one Data row, one model-options picker", async ({
  page,
}) => {
  await installAdmin(page);
  await page.goto("/settings");
  // Model options name the country once, in the header, not on every block.
  const options = page.getByRole("region", { name: "What the dashboard offers" });
  await expect(options.getByText("Kenya", { exact: true })).toHaveCount(1);
  await expect(options.getByRole("group", { name: "Low birth weight" })).toBeVisible();
  await expect(
    options.getByRole("group", { name: "Under-five mortality" }),
  ).toBeVisible();
  await expect(options.getByRole("group", { name: /Kenya/ })).toHaveCount(0);

  await page.goto("/settings?tab=data");
  const table = climateTable(page);
  await expect(table.getByRole("row", { name: "India" })).toHaveCount(1);
  await expect(table.getByRole("row", { name: "Kenya" })).toHaveCount(1);
  await expect(table.getByRole("row", { name: "Kenya" })).toContainText("0 of 4");
  await expect(table.getByRole("row", { name: "Kenya" })).toContainText("Never pulled");
  await table.getByRole("button", { name: "Kenya", exact: true }).click();
  await expect(page.getByRole("list", { name: "Kenya areas" })).toContainText(
    "no data",
  );
});

test("a climate pull shows at once, then follows itself to done in Jobs and the drawer", async ({
  page,
}) => {
  const { climate } = await installAdmin(page);
  await page.goto("/settings?tab=data");
  const kenya = climateTable(page).getByRole("row", { name: "Kenya" });
  await kenya.getByRole("button", { name: "Pull climate data for Kenya" }).click();

  // Queued straight away, from the API's answer - no refresh needed.
  await expect(kenya).toContainText("Queued");
  await expect(
    kenya.getByRole("button", { name: /climate data for Kenya/ }),
  ).toHaveText("Pulling…");
  expect(climate.posts).toEqual([{ country_code: "KE", months: [] }]);
  await expect(tab(page, "Jobs (1)")).toBeVisible();

  await tab(page, /^Jobs/).click();
  await expect(page).toHaveURL(/\?tab=jobs$/);
  const job = page.getByRole("listitem", { name: "Climate data · Kenya, Queued" });
  await expect(job).toContainText("Waiting for a worker to pick it up.");
  await expect(page.getByText(/1 running · updating every few seconds/)).toBeVisible();

  // The worker starts saving areas; the page notices on its own.
  climate.step({ status: "running", stage: "writing", areas_done: 2 });
  const running = page.getByRole("listitem", { name: "Climate data · Kenya, Running" });
  await expect(running).toContainText("Saving areas: 2 of 4.", { timeout: 10_000 });
  await expect(running.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
  await page.screenshot({ path: `${evidence}/jobs-running.png`, fullPage: true });

  // The top bar's drawer reads the same list.
  await page.getByRole("button", { name: "Open background work" }).click();
  const drawer = page.getByRole("complementary", { name: "Background work" });
  await expect(drawer.getByText("1 job running")).toBeVisible();
  await expect(drawer).toContainText("Saving areas: 2 of 4.");
  await page.screenshot({ path: `${evidence}/drawer-running.png` });
  await drawer.getByRole("button", { name: "Close background work" }).click();

  climate.step({ status: "completed", stage: "completed", areas_done: 4 });
  const done = page.getByRole("listitem", { name: "Climate data · Kenya, Done" });
  await expect(done).toContainText("4 areas updated.", { timeout: 10_000 });
  await expect(
    page.getByText("Nothing running right now", { exact: false }),
  ).toBeVisible();
  await expect(tab(page, /^Jobs/)).toHaveText("Jobs");

  // Coverage is read again once the pull has finished.
  await tab(page, "Data").click();
  await expect(kenya).toContainText("4 of 4");
  await expect(kenya).toContainText("Done");
});

test("a failed pull says why in Jobs and retries the same months", async ({ page }) => {
  const { climate } = await installAdmin(page);
  await page.goto("/settings?tab=data");
  const kenya = climateTable(page).getByRole("row", { name: "Kenya" });
  await kenya.getByRole("button", { name: "Pull climate data for Kenya" }).click();
  await expect(kenya).toContainText("Queued");

  climate.step({
    status: "failed",
    stage: "failed",
    error_code: "CLIMATE_INGEST_NOT_CONFIGURED",
  });
  await expect(kenya).toContainText("Failed", { timeout: 10_000 });
  await expect(
    kenya.getByRole("button", { name: "Retry climate data for Kenya" }),
  ).toBeEnabled();
  await page.screenshot({ path: `${evidence}/data-failed.png`, fullPage: true });

  await kenya.getByRole("link", { name: "See why in Jobs" }).click();
  await expect(page).toHaveURL(/\?tab=jobs$/);
  const failed = page.getByRole("listitem", { name: "Climate data · Kenya, Failed" });
  await expect(failed.getByRole("alert")).toHaveText(
    "Climate downloads are not set up on this server (no ERA5 credentials). Reference: CLIMATE_INGEST_NOT_CONFIGURED",
  );
  await page.screenshot({ path: `${evidence}/jobs-failed.png`, fullPage: true });

  await failed.getByRole("button", { name: "Retry" }).click();
  await expect(
    page.getByRole("listitem", { name: "Climate data · Kenya, Queued" }),
  ).toBeVisible();
  expect(climate.posts.at(-1)).toEqual({
    country_code: "KE",
    months: ["2025-10", "2026-09"],
  });
});

test("every tab fits a phone and a desktop without sideways scrolling", async ({
  page,
}) => {
  const { climate } = await installAdmin(page);
  await page.goto("/settings?tab=data");
  await climateTable(page)
    .getByRole("row", { name: "Kenya" })
    .getByRole("button", { name: "Pull climate data for Kenya" })
    .click();
  climate.step({ status: "running", stage: "writing", areas_done: 1 });

  for (const [label, viewport] of [
    ["desktop", { width: 1280, height: 900 }],
    ["phone", { width: 390, height: 844 }],
  ] as const) {
    await page.setViewportSize(viewport);
    for (const name of tabs) {
      await page.goto(
        name === "Workspace" ? "/settings" : `/settings?tab=${name.toLowerCase()}`,
      );
      await expect(tab(page, new RegExp(`^${name}`))).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await expect(page.locator("[aria-busy='true']")).toHaveCount(0);
      await expect(page.getByRole("status", { name: /^Loading/ })).toHaveCount(0);
      await noSidewaysScroll(page);
      await page.screenshot({
        path: `${evidence}/${name.toLowerCase()}-${label}.png`,
        fullPage: true,
        animations: "disabled",
      });
    }
  }
});
