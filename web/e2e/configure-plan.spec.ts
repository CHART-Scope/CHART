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
  // Districts ranked from the observed map fakeApi.ts draws (mapFor): Bhopal
  // at 12%, Gwalior without an estimate.
  const chosenDistricts = new Map<string, string[]>();
  // Two heat actions for India from the repository, ranked for the plan.
  const chosenActions = new Map<string, Record<string, unknown>[]>();
  api.on(/^\/api\/chart\/saved-plans\/[^/]+\/actions$/, async (route, url) => {
    const id = url.pathname.split("/")[4];
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as {
        items: Record<string, unknown>[];
      };
      writes.push({ method: "PUT actions", body });
      chosenActions.set(id, body.items);
    }
    const saved = chosenActions.get(id);
    const item = (
      actionId: string,
      title: string,
      seasons: string[],
      reasons: string[],
      rank: number,
      recommended: boolean,
    ) => {
      const choice = saved?.find((entry) => entry.action_id === actionId);
      return {
        id: actionId,
        title,
        summary: `${title}.`,
        seasons,
        departments: ["Health"],
        cost_level: "Low",
        reasons,
        rank,
        recommended,
        selected: saved ? Boolean(choice) : recommended,
        owner_department_id: choice?.owner_department_id ?? null,
        due_date: choice?.due_date ?? null,
      };
    };
    return json(route, {
      plan_id: id,
      phases: ["before", "during"],
      saved: Boolean(saved),
      items: [
        item(
          "rec-counsel",
          "Counsel pregnant women",
          ["before", "during"],
          ["Fits before the heat season, inside the plan's dates.", "Low cost."],
          1,
          true,
        ),
        item("rec-review", "Review the season", ["after"], ["Low cost."], 2, false),
      ],
      departments: [
        { id: 1, name: "Health" },
        { id: 2, name: "Labour" },
      ],
      priority_districts: ["Bhopal Division"],
    });
  });
  api.on(/^\/api\/chart\/saved-plans\/[^/]+\/districts$/, async (route, url) => {
    const id = url.pathname.split("/")[4];
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as { geography_ids: string[] };
      writes.push({ method: "PUT districts", body });
      chosenDistricts.set(id, body.geography_ids);
    }
    const saved = chosenDistricts.get(id);
    const area = (code: string, percent: number | null, rank: number | null) => ({
      geography_id: `geo-in-mp-${code}`,
      name: `${code[0].toUpperCase()}${code.slice(1)} Division`,
      level: "division",
      value_percent: percent,
      missing_reason: percent === null ? "no_prediction" : null,
      rank,
      suggested: percent !== null && percent >= 5,
      selected: saved ? saved.includes(`geo-in-mp-${code}`) : percent !== null,
    });
    return json(route, {
      plan_id: id,
      outcome: "under_five_mortality",
      source: "observed",
      month: null,
      saved: Boolean(saved),
      areas: [area("bhopal", 12, 1), area("gwalior", null, null)],
    });
  });
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
  await expect(next).toBeDisabled();
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

  await next.click();
  await expect(page).toHaveURL(/step=districts/);
  expect(writes.at(-1)).toEqual({
    method: "PATCH",
    // The fixture catalog names the hazard "heat" (fakeApi.ts).
    body: { hazard: "heat", outcomes: ["under_five_mortality", "lbw"] },
  });

  // Step 3: ranked by share, the suggested division pre-ticked.
  await expect(
    page.getByRole("heading", { level: 2, name: "Divisions of focus" }),
  ).toBeVisible();
  const suggested = page.getByRole("group", { name: "Suggested to prioritise (1)" });
  const other = page.getByRole("group", { name: "Other divisions (1)" });
  const bhopal = suggested.getByRole("checkbox", { name: /Bhopal Division/ });
  const gwalior = other.getByRole("checkbox", { name: /Gwalior Division/ });
  await expect(bhopal).toBeChecked();
  await expect(gwalior).not.toBeChecked();
  await expect(suggested).toContainText("12.0%");
  await expect(other).toContainText("No estimate");
  const count = page
    .getByRole("main")
    .getByRole("status")
    .filter({ hasText: "selected" });
  await expect(count).toHaveText("1 of 2 selected");
  const districtsSummary = page
    .getByRole("complementary", { name: "Plan summary" })
    .getByRole("region", { name: "Districts" });
  await expect(districtsSummary).toContainText("1 selected");
  await expect(districtsSummary).toContainText("Bhopal Division");

  await page.getByRole("button", { name: "Clear" }).click();
  await expect(count).toHaveText("0 of 2 selected");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Choose at least one district to continue.",
  );
  await expect(next).toBeDisabled();
  await page.getByRole("button", { name: "Select all" }).click();
  await expect(count).toHaveText("2 of 2 selected");
  await page.getByRole("button", { name: "Suggested (1)" }).click();
  await expect(gwalior).not.toBeChecked();
  // The map and the list share one selection: clicking Gwalior on the map ticks it.
  const mapGwalior = page
    .locator("svg path[aria-pressed]")
    .filter({ has: page.locator("xpath=self::*[contains(@aria-label, 'Gwalior')]") });
  await expect(page.locator("svg path[aria-pressed]")).toHaveCount(2);
  await mapGwalior.click();
  await expect(gwalior).toBeChecked();
  await expect(mapGwalior).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Search divisions").fill("bho");
  await expect(other.getByRole("checkbox")).toHaveCount(0);
  await page.getByLabel("Search divisions").fill("");
  await expect(gwalior).toHaveCSS("accent-color", "rgb(56, 62, 233)");
  await page.screenshot({
    path: "../outputs/e2e/web/configure-plan-districts.png",
    fullPage: true,
  });

  await next.click();
  await expect(page).toHaveURL(/step=actions/);
  expect(writes.at(-1)).toEqual({
    method: "PUT districts",
    body: { geography_ids: ["geo-in-mp-bhopal", "geo-in-mp-gwalior"] },
  });

  // The Planning center lists the draft and reopens it on step 2.
  await page.goto("/plan");
  const draftRow = page.getByRole("listitem", { name: "MP heat plan" });
  await expect(draftRow).toContainText("Draft");
  await draftRow.getByRole("link", { name: "Continue configuring" }).click();
  await expect(page).toHaveURL(/configure\?.*step=outcomes/);
  await expect(
    page.getByRole("group", { name: "Health outcomes" }).getByRole("checkbox", {
      name: /Under-five mortality/,
    }),
  ).toBeChecked();
  await steps.getByRole("button", { name: /Districts/ }).click();
  await expect(page.getByRole("checkbox", { name: /Gwalior Division/ })).toBeChecked();
  await steps.getByRole("button", { name: /Actions/ }).click();

  // Step 4: the repository's heat actions ranked for the plan; the one in
  // the plan window is pre-ticked, with the plan's suggested districts.
  const recommended = page.getByRole("group", {
    name: "Recommended for this plan (1)",
  });
  const counsel = recommended.getByRole("checkbox", { name: "Counsel pregnant women" });
  const review = page
    .getByRole("group", { name: "Other actions (1)" })
    .getByRole("checkbox", { name: "Review the season" });
  await expect(counsel).toBeChecked();
  await expect(review).not.toBeChecked();
  await expect(recommended).toContainText("Fits before the heat season");
  await expect(recommended).toContainText(
    "Priority districts in your selection: Bhopal Division",
  );
  await page.getByRole("combobox", { name: "Owner of Counsel pregnant women" }).click();
  await page.getByRole("option", { name: "Labour" }).click();
  await page.getByLabel("Due date of Counsel pregnant women").fill("2027-01-15");
  await counsel.uncheck();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Choose at least one action to save the plan.",
  );
  const savePlan = page.getByRole("button", { name: "Save plan" });
  await expect(savePlan).toBeDisabled();
  await counsel.check();
  await page.getByRole("combobox", { name: "Owner of Counsel pregnant women" }).click();
  await page.getByRole("option", { name: "Health" }).click();
  await page.getByLabel("Due date of Counsel pregnant women").fill("2027-01-15");
  await review.check();
  const actionsSummary = page
    .getByRole("complementary", { name: "Plan summary" })
    .getByRole("region", { name: "Actions" });
  await expect(actionsSummary).toContainText("2 actions");
  await expect(recommended.locator("[data-checked]")).toHaveCSS(
    "border-color",
    "rgb(56, 62, 233)",
  );
  await page.screenshot({
    path: "../outputs/e2e/web/configure-plan-actions.png",
    fullPage: true,
  });

  await savePlan.click();
  await expect(page).toHaveURL(/\/plan$/);
  expect(writes.slice(-2)).toEqual([
    {
      method: "PUT actions",
      body: {
        items: [
          { action_id: "rec-counsel", owner_department_id: 1, due_date: "2027-01-15" },
          { action_id: "rec-review", owner_department_id: null, due_date: null },
        ],
      },
    },
    { method: "PATCH", body: { status: "saved" } },
  ]);
  const plan = plans.get("00000000-0000-4000-8000-000000000001")!;
  expect(plan.status).toBe("saved");

  // A saved plan is no longer a draft and reopens in the wizard to edit.
  const row = page.getByRole("listitem", { name: "MP heat plan" });
  await expect(row).not.toContainText("Draft");
  await row.getByRole("link", { name: "Edit plan" }).click();
  await expect(page.getByLabel("Plan name")).toHaveValue("MP heat plan");
  await expect(page.getByLabel("Start date")).toHaveValue("2026-11-09");
  await page.reload();
  await page
    .getByRole("navigation", { name: "Plan steps" })
    .getByRole("button", { name: /Actions/ })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Owner of Counsel pregnant women" }),
  ).toContainText("Health");
  await expect(page.getByRole("checkbox", { name: "Review the season" })).toBeChecked();
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
