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
  getSavedPlan,
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

/** Districts, actions and review come next; their tabs show but stay shut. */
const LAST_BUILT_STEP = 1;
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
      : form.outcomes.length === 0
        ? "Choose at least one health outcome to continue."
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
      } else {
        saved = await updateSavedPlan(planId!, {
          hazard,
          outcomes: form.outcomes,
        });
      }
      queryClient.setQueryData(["saved-plan", saved.id], saved);
      await queryClient.invalidateQueries({ queryKey: ["saved-plans"] });
      if (stepIndex === 0) go(1, saved.id);
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
            {stepIndex === 0 && problem ? (
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
                disabled={Boolean(problem) || saving}
                onClick={() => void save()}
              >
                {saving ? "Saving…" : stepIndex === 0 ? "Next" : "Save draft"}
              </Button>
            </div>
            {stepIndex === LAST_BUILT_STEP ? (
              <p className={styles.note}>
                Districts, actions and the report come next. Your draft is kept in the
                Planning center.
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
