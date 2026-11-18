"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/Button";
import { Stepper } from "@/components/Stepper";
import { FALLBACK_CALENDAR } from "@/features/actions";
import { DashboardHeader } from "@/features/dashboard/DashboardHeader";
import { getHeatSeason } from "@/lib/heatSeasonsClient";
import {
  createSavedPlan,
  getPlanActions,
  getPlanDistricts,
  getSavedPlan,
  savePlanActions,
  savePlanDistricts,
  type PlanActionChoice,
  updateSavedPlan,
  type SavedPlan,
} from "@/lib/savedPlansClient";
import { useGeographies } from "@/lib/useGeographies";
import { useModelCatalog } from "@/lib/useModelCatalog";

import {
  PLAN_STEPS,
  configurePlanHref,
  type ConfigurePlanQuery,
} from "./configurePlanHref";
import { ActionsStep } from "./ActionsStep";
import { DistrictsStep } from "./DistrictsStep";
import { OutcomesStep, type OutcomeOption } from "./OutcomesStep";
import { phasesCovered } from "./PhaseBar";
import { PlanSummary } from "./PlanSummary";
import { TimelineStep } from "./TimelineStep";
import {
  isoDay,
  matchingQuickWindow,
  quickWindow,
  windowMonths,
  windowProblem,
  type PlanWindow,
} from "./planWindow";

import styles from "./ConfigurePlan.module.css";

/** Review & export comes next; its tab shows but stays shut. */
const LAST_BUILT_STEP = 3;
/** Canvas wording for the outcomes CHART models; the catalog's otherwise. */
const OUTCOME_DESCRIPTIONS: Record<string, string> = {
  lbw: "Share of low-birth-weight cases attributable to maternal heat exposure.",
  under_5_mortality:
    "Share of deaths in children under five attributable to heat exposure.",
};

/**
 * Configure plan (canvas frames 10-14). Step 1 starts a draft plan with its
 * name and dates; each later step saves its choices to it, so the draft
 * survives a reload and is listed in the Planning center.
 */
export function ConfigurePlan(query: ConfigurePlanQuery) {
  const { geographyId, adminUnit, planId } = query;
  const placeId = adminUnit ?? geographyId;
  const router = useRouter();
  const queryClient = useQueryClient();
  const stepIndex = Math.max(
    0,
    Math.min(
      LAST_BUILT_STEP,
      PLAN_STEPS.findIndex((step) => step.id === query.step),
    ),
  );
  const [today] = useState(() => new Date());

  const plan = useQuery({
    queryKey: ["saved-plan", planId],
    queryFn: ({ signal }) => getSavedPlan(planId!, signal),
    enabled: planId !== null,
    retry: false,
  });
  const season = useQuery({
    queryKey: ["heat-season", placeId],
    queryFn: ({ signal }) => getHeatSeason(placeId, signal),
    retry: false,
    staleTime: 5 * 60_000,
  });
  // The districts ranked for the plan's first outcome, and the saved choice.
  const districts = useQuery({
    queryKey: ["plan-districts", planId],
    queryFn: ({ signal }) => getPlanDistricts(planId!, signal),
    enabled: planId !== null,
    retry: false,
  });
  const [chosen, setChosen] = useState<{ key: number; ids: Set<string> } | null>(null);
  const chosenIds =
    chosen && chosen.key === districts.dataUpdatedAt
      ? chosen.ids
      : new Set(
          (districts.data?.areas ?? [])
            .filter((area) => area.selected)
            .map((area) => area.geography_id),
        );
  // The repository's actions ranked for the plan, and the saved choice.
  const actions = useQuery({
    queryKey: ["plan-actions", planId],
    queryFn: ({ signal }) => getPlanActions(planId!, signal),
    enabled: planId !== null && stepIndex >= 2,
    retry: false,
  });
  const [picked, setPicked] = useState<{
    key: number;
    items: Map<string, PlanActionChoice>;
  } | null>(null);
  const pickedItems =
    picked && picked.key === actions.dataUpdatedAt
      ? picked.items
      : new Map(
          (actions.data?.items ?? [])
            .filter((item) => item.selected)
            .map((item) => [
              item.id,
              {
                action_id: item.id,
                owner_department_id: item.owner_department_id,
                due_date: item.due_date,
              },
            ]),
        );
  const calendar = season.data?.months ?? FALLBACK_CALENDAR;
  const calendarReady = !season.isPending;
  const { geographies, error: geographiesError } = useGeographies();
  const { catalog } = useModelCatalog(geographyId);

  const trail = useMemo(() => {
    const byId = new Map((geographies ?? []).map((geo) => [geo.id, geo]));
    const names: string[] = [];
    for (
      let geo = byId.get(placeId);
      geo;
      geo = geo.parentId ? byId.get(geo.parentId) : undefined
    )
      names.unshift(geo.name);
    return names.length > 0 ? names : [placeId];
  }, [geographies, placeId]);
  const placeName = trail.at(-1) ?? placeId;

  // The hazard the models cover for the dashboard's outcome (extreme heat
  // today) and every outcome modelled under it.
  const hazard =
    catalog?.find((entry) => entry.outcome === query.outcome)?.climate_hazard ??
    catalog?.[0]?.climate_hazard ??
    "extreme_heat";
  const heatEntries = (catalog ?? []).filter(
    (entry) => entry.climate_hazard === hazard,
  );
  const hazardLabel = heatEntries[0]?.climate_hazard_label ?? "Extreme heat";
  const domainLabel =
    heatEntries[0]?.health_domain_label ?? "Maternal, newborn and child health";
  const outcomeOptions: OutcomeOption[] = heatEntries.map((entry) => ({
    code: entry.outcome,
    label: entry.outcome_label,
    description:
      OUTCOME_DESCRIPTIONS[entry.outcome] ??
      entry.risk_description ??
      entry.outcome_label,
  }));

  // The form, seeded once from the draft or, for a new plan, the next
  // planning cycle of the place's heat season.
  const [form, setForm] = useState<{
    name: string;
    window: PlanWindow;
    outcomes: string[];
  } | null>(null);
  useEffect(() => {
    if (form || !calendarReady) return;
    if (planId) {
      if (!plan.data) return;
      setForm(formFromPlan(plan.data, calendar, today));
      return;
    }
    // A new plan is named after its place, so wait for the place's name.
    if (!geographies && !geographiesError) return;
    const window = quickWindow("cycle", calendar, today);
    const year = Number(window.start.slice(0, 4));
    setForm({
      name: `${placeName} heat-health plan ${year}–${String(year + 1).slice(2)}`,
      window,
      outcomes: [query.outcome],
    });
  }, [
    form,
    calendarReady,
    planId,
    plan.data,
    calendar,
    today,
    placeName,
    geographies,
    geographiesError,
    query.outcome,
  ]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = (step: number, id: string | null = planId) =>
    router.push(
      configurePlanHref({ ...query, planId: id, step: PLAN_STEPS[step].id }),
      { scroll: true },
    );
  const dashboardQuery = new URLSearchParams({ outcome: query.outcome });
  if (adminUnit) dashboardQuery.set("admin_unit", adminUnit);
  const dashboardHref = `/dashboard/${encodeURIComponent(geographyId)}?${dashboardQuery}`;

  const months = form ? windowMonths(form.window, calendar) : [];
  const problem = !form
    ? null
    : stepIndex === 0
      ? !form.name.trim()
        ? "Give the plan a name."
        : windowProblem(form.window, today)
      : stepIndex === 1
        ? form.outcomes.length === 0
          ? "Choose at least one health outcome to continue."
          : null
        : stepIndex === 2
          ? districts.data && chosenIds.size === 0
            ? "Choose at least one district to continue."
            : null
          : actions.data && pickedItems.size === 0
            ? "Choose at least one action to save the plan."
            : null;

  async function save() {
    if (!form || problem || saving) return;
    setSaving(true);
    setError(null);
    try {
      let saved: SavedPlan;
      if (stepIndex === 0) {
        const fields = {
          name: form.name.trim(),
          start_date: form.window.start,
          end_date: form.window.end,
        };
        saved = planId
          ? await updateSavedPlan(planId, fields)
          : await createSavedPlan({
              ...fields,
              geography_id: geographyId,
              admin_unit_id: adminUnit,
              outcome: query.outcome,
              status: "draft",
            });
      } else if (stepIndex === 1) {
        saved = await updateSavedPlan(planId!, {
          hazard,
          outcomes: form.outcomes,
        });
        // The first outcome ranks the districts.
        await queryClient.invalidateQueries({ queryKey: ["plan-districts", planId] });
      } else if (stepIndex === 2) {
        const result = await savePlanDistricts(planId!, [...chosenIds]);
        queryClient.setQueryData(["plan-districts", planId], result);
        // The actions name the plan's suggested districts.
        await queryClient.invalidateQueries({ queryKey: ["plan-actions", planId] });
        saved = plan.data!;
      } else {
        const result = await savePlanActions(planId!, [...pickedItems.values()]);
        queryClient.setQueryData(["plan-actions", planId], result);
        saved = await updateSavedPlan(planId!, { status: "saved" });
      }
      queryClient.setQueryData(["saved-plan", saved.id], saved);
      await queryClient.invalidateQueries({ queryKey: ["saved-plans"] });
      if (stepIndex < LAST_BUILT_STEP) go(stepIndex + 1, saved.id);
      else router.push("/plan");
    } catch (failure) {
      setError((failure as Error).message);
      setSaving(false);
    }
  }
  // A new step starts idle.
  useEffect(() => setSaving(false), [stepIndex]);

  const loadError =
    plan.error instanceof Error
      ? plan.error.message
      : stepIndex > 0 && !planId
        ? "Start with the timeline: the plan is saved as a draft from there."
        : null;
  const outcomeLabels = (form?.outcomes ?? [])
    .map((code) => outcomeOptions.find((option) => option.code === code)?.label)
    .filter((label): label is string => Boolean(label));
  const districtNames = (districts.data?.areas ?? [])
    .filter((area) => chosenIds.has(area.geography_id))
    .map((area) => area.name);
  const stepError =
    stepIndex === 2 && districts.error instanceof Error
      ? districts.error.message
      : stepIndex === 3 && actions.error instanceof Error
        ? actions.error.message
        : null;

  return (
    <main className={styles.page}>
      <DashboardHeader
        trail={[...trail, "Configure plan"]}
        placeHref={dashboardHref}
        hazardLabel={hazardLabel}
        healthDomainLabel={domainLabel}
      />
      <header className={styles.intro}>
        <h1 className={styles.title}>Configure plan</h1>
        <p className={styles.lede}>
          Create or update a heat-health adaptation plan for {placeName}: choose when it
          runs, which health outcomes and districts to focus on, and which actions to
          include — then export it as a report.
        </p>
      </header>
      <Stepper
        variant="tabs"
        aria-label="Plan steps"
        steps={PLAN_STEPS}
        currentIndex={stepIndex}
        lastOpenIndex={planId ? LAST_BUILT_STEP : 0}
        onStepClick={(index) => {
          if (index !== stepIndex) go(index);
        }}
      />
      {loadError ? (
        <p role="alert" className={styles.problem}>
          {loadError}
        </p>
      ) : !form ? (
        <p role="status" className={styles.lede}>
          Loading the plan…
        </p>
      ) : (
        <div className={styles.layout}>
          <div className={styles.main}>
            {stepIndex === 0 ? (
              <TimelineStep
                name={form.name}
                onName={(name) => setForm({ ...form, name })}
                window={form.window}
                onWindow={(window) => setForm({ ...form, window })}
                quick={matchingQuickWindow(form.window, calendar, today)}
                onQuick={(id) =>
                  setForm({ ...form, window: quickWindow(id, calendar, today) })
                }
                months={months}
                seasonLabel={seasonLabel(calendar)}
                today={isoDay(today)}
              />
            ) : stepIndex === 2 ? (
              districts.data ? (
                <DistrictsStep
                  placeId={geographyId}
                  placeName={placeName}
                  outcomeLabel={
                    outcomeOptions.find(
                      (option) => option.code === districts.data.outcome,
                    )?.label ?? districts.data.outcome
                  }
                  districts={districts.data}
                  selected={chosenIds}
                  onChange={(ids) => setChosen({ key: districts.dataUpdatedAt, ids })}
                />
              ) : stepError ? null : (
                <p role="status" className={styles.lede}>
                  Ranking the districts…
                </p>
              )
            ) : stepIndex === 3 ? (
              actions.data ? (
                <ActionsStep
                  actions={actions.data}
                  chosen={pickedItems}
                  onChange={(items) => setPicked({ key: actions.dataUpdatedAt, items })}
                  window={windowProblem(form.window, today) ? null : form.window}
                />
              ) : stepError ? null : (
                <p role="status" className={styles.lede}>
                  Ranking the actions…
                </p>
              )
            ) : (
              <OutcomesStep
                hazardLabel={hazardLabel}
                domainLabel={domainLabel}
                options={outcomeOptions}
                chosen={form.outcomes}
                onToggle={(code) =>
                  setForm({
                    ...form,
                    outcomes: form.outcomes.includes(code)
                      ? form.outcomes.filter((item) => item !== code)
                      : [...form.outcomes, code],
                  })
                }
              />
            )}
            {stepError ? (
              <p role="alert" className={styles.problem}>
                {stepError}
              </p>
            ) : null}
            {stepIndex !== 1 && problem ? (
              <p role="alert" className={styles.problem}>
                {problem}
              </p>
            ) : null}
            {error ? (
              <p role="alert" className={styles.problem}>
                {error}
              </p>
            ) : null}
            <div className={styles.nav}>
              {stepIndex === 0 ? (
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => router.push(dashboardHref)}
                >
                  Cancel
                </Button>
              ) : (
                <Button variant="secondary" size="lg" onClick={() => go(stepIndex - 1)}>
                  Back
                </Button>
              )}
              <Button
                size="lg"
                disabled={
                  Boolean(problem) ||
                  saving ||
                  (stepIndex === 2 && !districts.data) ||
                  (stepIndex === 3 && !actions.data)
                }
                onClick={() => void save()}
              >
                {saving
                  ? "Saving…"
                  : stepIndex === LAST_BUILT_STEP
                    ? "Save plan"
                    : "Next"}
              </Button>
            </div>
            {stepIndex === LAST_BUILT_STEP ? (
              <p className={styles.note}>
                The report and its export come next. Until you save the plan, your draft
                is kept in the Planning center.
              </p>
            ) : null}
          </div>
          <PlanSummary
            name={form.name.trim()}
            window={windowProblem(form.window, today) ? null : form.window}
            monthCount={months.length}
            phases={phasesCovered(months)}
            hazardLabel={hazardLabel}
            outcomeLabels={outcomeLabels}
            districtNames={districts.data ? districtNames : null}
            actionCount={actions.data ? pickedItems.size : null}
            onEdit={planId ? (step) => go(step) : null}
          />
        </div>
      )}
    </main>
  );
}

function formFromPlan(plan: SavedPlan, calendar: string, today: Date) {
  return {
    name: plan.name,
    window:
      plan.start_date && plan.end_date
        ? { start: plan.start_date, end: plan.end_date }
        : quickWindow("cycle", calendar, today),
    outcomes: plan.outcomes,
  };
}

/** "March–June" from a calendar's during months. */
function seasonLabel(calendar: string): string {
  const name = (month: number) =>
    new Date(2000, month, 1).toLocaleString("en-GB", { month: "long" });
  const during = [...calendar].flatMap((letter, i) => (letter === "d" ? [i] : []));
  if (during.length === 0) return "not set";
  // A season may wrap the year end (Kenya: December to March).
  const first =
    during.find((month) => !during.includes((month + 11) % 12)) ?? during[0];
  const last =
    during.find((month) => !during.includes((month + 1) % 12)) ?? during.at(-1)!;
  return first === last ? name(first) : `${name(first)}–${name(last)}`;
}
