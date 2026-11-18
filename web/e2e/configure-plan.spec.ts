import { expect, test, type Page } from "@playwright/test";

import { installFakeApi, json, type FakeApi } from "./support/fakeApi";

// Configure plan, steps 1-2 (canvas frames 10-11) against the browser's API
// boundary. A planner names the plan and picks its window, the draft is
// created, then its outcomes are saved; each request carries what the step
// shows. Failure modes: a window the API refuses, a step opened before a
// draft exists, a plan that no longer exists, a role that may not change it,
// and steps 3-5 opening before they are built. The live suite
// (e2e/configure-plan-live.spec.ts) persists the same draft in PostGIS.

const PLACE = "geo-in-mp";
const TODAY = new Date("2026-11-09T10:00:00");

type Plan = Record<string, unknown> & { id: string };

/** Saved plans held in memory, answering as the API does. */
function installPlans(api: FakeApi) {
  const plans = new Map<string, Plan>();
  const writes: { method: string; body: Record<string, unknown> }[] = [];
  // The next write is refused with this error, as the API would.
  const refusal: { next: { error: string; status: number } | null } = { next: null };
  api.on(/^\/api\/chart\/heat-seasons\/geo-in-mp$/, (route) =>
    json(route, {
      geography_id: PLACE,
      name: "Madhya Pradesh",
      level_label: "State",
      parent_id: "geo-in",
      depth: 1,
      own: null,
      months: "bbddddaaaabb",
      state: "official",
      inherited_from: null,
      source: "India Meteorological Department",
    }),
  );
  api.on(/^\/api\/chart\/saved-plans(\/[^/]+)?$/, async (route, url) => {
    const method = route.request().method();
    const id = url.pathname.split("/")[4];
    if (method === "GET" && !id) return json(route, { items: [...plans.values()] });
    if (method === "GET") {
      const plan = plans.get(id);
      return plan
        ? json(route, plan)
        : json(route, { error: "SAVED_PLAN_NOT_FOUND" }, 404);
    }
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (refusal.next) {
      const { error, status } = refusal.next;
      refusal.next = null;
      return json(route, { error }, status);
    }
    writes.push({ method, body });
    if (method === "POST") {
      const plan: Plan = {
        id: `00000000-0000-4000-8000-00000000000${plans.size + 1}`,
        status: "saved",
        admin_unit_id: null,
        hazard: "extreme_heat",
        outcomes: [body.outcome],
        start_date: null,
        end_date: null,
        choices: { view: "projection" },
        figure: {
          status: "unavailable",
          reason: "No estimate.",
          heat_season_months: [],
        },
        signals: { risk_level: "unknown", timing: "before" },
        created_at: TODAY.toISOString(),
        updated_at: TODAY.toISOString(),
        ...body,
      };
      plans.set(plan.id, plan);
      return json(route, plan, 201);
    }
    const plan = { ...plans.get(id)!, ...body };
    plans.set(id, plan);
    return json(route, plan);
  });
  return {
    plans,
    writes,
    refuseNext: (error: string, status: number) => {
      refusal.next = { error, status };
    },
  };
}

async function openWizard(page: Page, query = "outcome=lbw") {
  await page.clock.setFixedTime(TODAY);
  await page.goto(`/dashboard/${PLACE}/configure?${query}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Configure plan" }),
  ).toBeVisible();
}

test("a planner starts a draft with its timeline, then saves its outcomes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const api = await installFakeApi(page);
  const { plans, writes } = installPlans(api);
  await openWizard(page);

  const steps = page.getByRole("navigation", { name: "Plan steps" });
  await expect(steps.getByRole("button")).toHaveText([
    "1Timeline",
    "2Hazards & outcomes",
    "3Districts",
    "4Actions",
    "5Review & export",
  ]);
  await expect(steps.getByRole("button", { name: /Timeline/ })).toHaveAttribute(
    "aria-current",
    "step",
  );
  // Until a draft exists only the timeline opens; districts on are not built.
  for (const name of [/Hazards/, /Districts/, /Actions/, /Review/])
    await expect(steps.getByRole("button", { name })).toBeDisabled();
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText(
    "India›Madhya Pradesh›Configure plan",
  );

  // The next planning cycle of IMD's March-June season is the default.
  const name = page.getByLabel("Plan name");
  await expect(name).toHaveValue("Madhya Pradesh heat-health plan 2026–27");
  const quick = page.getByRole("group", { name: "Quick select" });
  await expect(
    quick.getByRole("button", { name: "Next planning cycle" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Start date")).toHaveValue("2026-11-09");
  await expect(page.getByLabel("End date")).toHaveValue("2027-10-31");
  const bar = page.getByRole("list", { name: "Heat-season phase of each month" });
  await expect(bar.getByRole("listitem")).toHaveCount(12);
  await expect(bar.getByRole("listitem").first()).toHaveAccessibleName(
    "November 2026: before heat season",
  );
  await expect(bar.getByRole("listitem").nth(4)).toHaveAccessibleName(
    "March 2027: during heat season",
  );
  await expect(page.getByText("During heat season (March–June)")).toBeVisible();
  const summary = page.getByRole("complementary", { name: "Plan summary" });
  const timeline = summary.getByRole("region", { name: "Timeline" });
  await expect(timeline).toContainText("9 Nov 2026 – 31 Oct 2027");
  await expect(timeline).toContainText("12 months");
  await expect(timeline.getByRole("listitem")).toHaveText([
    "Before heat season",
    "During heat season",
    "After heat season",
  ]);

  // Design-system values on the changed controls.
  await expect(name).toHaveCSS("height", "44px");
  const next = page.getByRole("button", { name: "Next", exact: true });
  await expect(next).toHaveCSS("height", "48px");
  await expect(next).toHaveCSS("background-color", "rgb(56, 62, 233)");
  await expect(next).toHaveCSS("font-family", /Fira Sans/);
  await expect(bar.getByRole("listitem").first()).toHaveCSS(
    "background-color",
    "rgb(74, 97, 51)",
  );
  await expect(bar.getByRole("listitem").nth(4)).toHaveCSS(
    "background-color",
    "rgb(204, 61, 92)",
  );
  await expect(
    page.getByRole("heading", { level: 2, name: "Timeline of focus" }),
  ).toHaveCSS("font-weight", "600");
  await page.screenshot({
    path: "../outputs/e2e/web/configure-plan-timeline.png",
    fullPage: true,
  });

  // Heat season only, then a window the browser refuses before sending.
  await quick.getByRole("button", { name: "Heat season only" }).click();
  await expect(page.getByLabel("Start date")).toHaveValue("2027-03-01");
  await expect(page.getByLabel("End date")).toHaveValue("2027-06-30");
  await expect(bar.getByRole("listitem")).toHaveCount(4);
  await expect(timeline.getByRole("listitem")).toHaveText(["During heat season"]);
  await page.getByLabel("End date").fill("2027-02-01");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Choose an end date on or after the start date.",
  );
  await expect(next).toBeDisabled();
  await quick.getByRole("button", { name: "Next 6 months" }).click();
  await expect(page.getByLabel("End date")).toHaveValue("2027-05-08");
  await name.fill("  ");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Give the plan a name.",
  );
  await name.fill("MP heat plan");
  expect(writes).toEqual([]);

  await next.click();
  await expect(page).toHaveURL(/step=outcomes/);
  await expect(page).toHaveURL(/plan=00000000-0000-4000-8000-000000000001/);
  expect(writes[0]).toEqual({
    method: "POST",
    body: {
      name: "MP heat plan",
      start_date: "2026-11-09",
      end_date: "2027-05-08",
      geography_id: PLACE,
      admin_unit_id: null,
      outcome: "lbw",
      status: "draft",
    },
  });

  // Step 2: extreme heat and MNCH are fixed; the roadmap is listed, disabled.
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: "Climate hazards and health outcomes",
    }),
  ).toBeVisible();
  const hazard = page.getByRole("group", { name: "Climate hazard" });
  await expect(hazard.getByRole("checkbox", { name: /Heat/ })).toBeChecked();
  for (const soon of ["Flooding", "Drought", "Air pollution"])
    await expect(
      hazard.getByRole("checkbox", { name: new RegExp(soon) }),
    ).toBeDisabled();
  const outcomes = page.getByRole("group", { name: "Health outcomes" });
  const lbw = outcomes.getByRole("checkbox", { name: /Low birth weight/ });
  const u5 = outcomes.getByRole("checkbox", { name: /Under-five mortality/ });
  await expect(lbw).toBeChecked();
  await expect(u5).not.toBeChecked();
  await lbw.uncheck();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Choose at least one health outcome to continue.",
  );
  const saveDraft = page.getByRole("button", { name: "Save draft" });
  await expect(saveDraft).toBeDisabled();
  await u5.check();
  await lbw.check();
  const outcomesSummary = page
    .getByRole("complementary", { name: "Plan summary" })
    .getByRole("region", { name: "Hazard and outcomes" });
  await expect(outcomesSummary.getByRole("listitem")).toHaveText([
    "Heat",
    "Under-five mortality",
    "Low birth weight",
  ]);
  await expect(
    outcomes.locator("label").filter({ hasText: "Under-five mortality" }),
  ).toHaveCSS("border-color", "rgb(56, 62, 233)");
  await page.screenshot({
    path: "../outputs/e2e/web/configure-plan-outcomes.png",
    fullPage: true,
  });

  // Back keeps the draft's timeline; Edit in the summary returns to step 2.
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByLabel("End date")).toHaveValue("2027-05-08");
  await page.getByRole("button", { name: "Edit hazard and outcomes" }).click();
  await expect(page).toHaveURL(/step=outcomes/);

  await saveDraft.click();
  await expect(page).toHaveURL(/\/plan$/);
  expect(writes.at(-1)).toEqual({
    method: "PATCH",
    // The fixture catalog names the hazard "heat" (fakeApi.ts).
    body: { hazard: "heat", outcomes: ["under_five_mortality", "lbw"] },
  });
  const plan = plans.get("00000000-0000-4000-8000-000000000001")!;
  expect(plan.status).toBe("draft");

  // The Planning center lists the draft and reopens it on step 2.
  const row = page.getByRole("listitem", { name: "MP heat plan" });
  await expect(row).toContainText("Draft");
  await row.getByRole("link", { name: "Continue configuring" }).click();
  await expect(page).toHaveURL(/configure\?.*step=outcomes/);
  await expect(
    page.getByRole("group", { name: "Health outcomes" }).getByRole("checkbox", {
      name: /Under-five mortality/,
    }),
  ).toBeChecked();
  await page.reload();
  await expect(page.getByLabel("Plan name")).toHaveCount(0);
  await page
    .getByRole("navigation", { name: "Plan steps" })
    .getByRole("button", { name: /Timeline/ })
    .click();
  await expect(page.getByLabel("Plan name")).toHaveValue("MP heat plan");
  await expect(page.getByLabel("Start date")).toHaveValue("2026-11-09");
  expect(api.unhandled).toEqual([]);
});

test("refused windows, missing plans and read-only roles show their reason", async ({
  page,
}) => {
  const api = await installFakeApi(page);
  const { writes, refuseNext } = installPlans(api);

  // Hazards & outcomes needs a draft to save into.
  await openWizard(page, "outcome=lbw&step=outcomes");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Start with the timeline: the plan is saved as a draft from there.",
  );

  // A removed plan, or another user's, is reported rather than shown blank.
  await openWizard(page, "outcome=lbw&plan=00000000-0000-4000-8000-00000000dead");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "This plan no longer exists.",
  );

  // The API's refusal is shown and the planner stays on the step.
  refuseNext("PLAN_START_IN_PAST", 422);
  await openWizard(page);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "A plan starts today or later. Choose a later start date.",
  );
  await expect(page).not.toHaveURL(/step=outcomes/);
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeEnabled();

  refuseNext("CAPABILITY_NOT_ALLOWED", 403);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Your role can read plans here but not change them.",
  );
  // Cancel returns to the dashboard it came from.
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page).toHaveURL(/\/dashboard\/geo-in-mp\?outcome=lbw$/);
  expect(writes).toEqual([]);
});
