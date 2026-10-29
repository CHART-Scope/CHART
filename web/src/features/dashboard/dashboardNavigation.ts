import type { OutlookChoices } from "./HeatOutlookPanel";

export type DashboardSearch = {
  admin_unit?: string;
  outcome?: string;
  month?: string;
  view?: string;
  scenario?: string;
  period?: string;
  selector?: string;
  observed_selector?: string;
  reference?: string;
};

/** The URL is the shared source of truth for navigation, reload and Back. */
export function readOutlookChoices(search: DashboardSearch): OutlookChoices {
  return {
    view:
      search.view === "observed" || search.view === "projection"
        ? search.view
        : undefined,
    month: search.month,
    scenario: search.scenario,
    period: search.period,
    selector: search.selector,
    observedSelector: search.observed_selector,
    reference:
      search.reference === "annual" || search.reference === "peak"
        ? search.reference
        : undefined,
  };
}

export function dashboardHref({
  geographyId,
  adminUnit,
  outcome,
  choices,
}: {
  geographyId: string;
  adminUnit?: string | null;
  outcome: string;
  choices: OutlookChoices;
}): string {
  const params = new URLSearchParams();
  if (adminUnit) params.set("admin_unit", adminUnit);
  if (outcome) params.set("outcome", outcome);
  for (const [key, value] of Object.entries({
    view: choices.view,
    month: choices.month,
    scenario: choices.scenario,
    period: choices.period,
    selector: choices.selector,
    observed_selector: choices.observedSelector,
    reference: choices.reference,
  })) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return `/dashboard/${encodeURIComponent(geographyId)}${query ? `?${query}` : ""}`;
}
