import type {
  ClimateMonth,
  GeographyRecord,
  PlanningOptions,
  PlanningTarget,
  PredictionRequest,
} from "@/lib/planningClient";

export type PlanningPeriod =
  "next-three-months" | "next-hot-season" | "long-term" | "specific-month";

export type ClimateScenario = "ssp126" | "ssp370" | "ssp585";

export type PlanningSelection = {
  area: string;
  period: PlanningPeriod;
  scenario: ClimateScenario | "";
  specificMonth: string;
};

export const defaultPlanningSelection = (): PlanningSelection => ({
  area: "",
  period: "next-three-months",
  scenario: "",
  specificMonth: "",
});

export function areaLabel(value: string, areas: GeographyRecord[]) {
  return areas.find((area) => area.id === value)?.name ?? value;
}

export function periodTitle(period: PlanningPeriod) {
  if (period === "next-three-months") return "Next three months";
  if (period === "next-hot-season") return "Next hot season";
  if (period === "long-term") return "Long-term hot season";
  return "Chosen three-month period";
}

export function periodMonths(
  selection: PlanningSelection,
  options: PlanningOptions | null,
) {
  if (selection.period === "next-three-months") {
    return options?.next_three_months.months ?? [];
  }
  if (selection.period === "next-hot-season") {
    return options?.next_heat_season?.months ?? [];
  }
  if (selection.period === "long-term") {
    return options?.long_term_projection?.months ?? [];
  }
  if (!selection.specificMonth) return [];
  const anchor = new Date(`${selection.specificMonth}-01T00:00:00Z`);
  return [-2, -1, 0].map((offset) => {
    const month = new Date(
      Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + offset, 1),
    );
    return month.toISOString().slice(0, 10);
  });
}

export function periodDescription(
  selection: PlanningSelection,
  options: PlanningOptions | null,
) {
  return periodMonths(selection, options).map(formatApiMonth).join(" · ");
}

export function targetForPeriod(period: PlanningPeriod): PlanningTarget {
  if (period === "next-three-months") return "next_three_months";
  if (period === "next-hot-season") return "next_heat_season";
  if (period === "long-term") return "long_term_hot_season";
  return "month";
}

export function planningMonth(selection: PlanningSelection, options: PlanningOptions) {
  if (selection.period === "next-three-months") {
    return options.next_three_months.planning_date.slice(0, 7);
  }
  if (selection.period === "next-hot-season") {
    return options.next_heat_season?.planning_date.slice(0, 7) ?? "";
  }
  if (selection.period === "long-term") {
    return options.long_term_projection?.planning_date.slice(0, 7) ?? "";
  }
  return selection.specificMonth;
}

export function selectionFromRequest(request: PredictionRequest): PlanningSelection {
  const period =
    request.planning_target === "next_three_months"
      ? "next-three-months"
      : request.planning_target === "next_heat_season"
        ? "next-hot-season"
        : request.planning_target === "long_term_hot_season"
          ? "long-term"
          : "specific-month";
  return {
    area: request.geography_id,
    period,
    scenario: request.projection_scenario ?? "",
    specificMonth: request.planning_date.slice(0, 7),
  };
}

export function climateSourceSummary(climate: ClimateMonth[]) {
  return [...new Set(climate.map((month) => month.source_name).filter(Boolean))].join(
    " + ",
  );
}

export function formatApiMonth(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 7)}-01T00:00:00Z`));
}

export function formatDay(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}
