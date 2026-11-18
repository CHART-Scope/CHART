import type { Step } from "@/components/Stepper";

export const PLAN_STEPS: Step[] = [
  { id: "timeline", title: "Timeline" },
  { id: "outcomes", title: "Hazards & outcomes" },
  { id: "districts", title: "Districts" },
  { id: "actions", title: "Actions" },
  { id: "review", title: "Review & export" },
];
export type ConfigurePlanQuery = {
  geographyId: string;
  adminUnit: string | null;
  outcome: string;
  planId: string | null;
  step: string | null;
};

/** The Configure plan wizard's address; the step and draft live in the URL. */
export function configurePlanHref({
  geographyId,
  adminUnit,
  outcome,
  planId,
  step,
}: Omit<ConfigurePlanQuery, "step"> & { step?: string }) {
  const query = new URLSearchParams({ outcome });
  if (adminUnit) query.set("admin_unit", adminUnit);
  if (planId) query.set("plan", planId);
  if (step && step !== PLAN_STEPS[0].id) query.set("step", step);
  return `/dashboard/${encodeURIComponent(geographyId)}/configure?${query}`;
}
