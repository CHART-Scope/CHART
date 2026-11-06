import type { PlanTiming, RiskLevel, SavedPlan } from "@/lib/savedPlansClient";

export const timingSeason: Record<PlanTiming, string> = {
  before: "Before heat season",
  during: "During heat season",
  after: "After heat season",
};

export const riskLabels: Record<RiskLevel, string> = {
  elevated: "Heat risk clearly raised",
  possible: "Heat risk possibly raised",
  not_detected: "No raised heat risk detected",
  unknown: "No estimate captured",
};

/** "4.2% of low birth weight cases in Nairobi may be attributed to heat in …". */
export function planFigureSentence(plan: SavedPlan, outcomeLabel: string) {
  const { figure } = plan;
  if (figure.status !== "captured" || figure.percent === null)
    return figure.reason ?? "No published estimate was captured for this plan.";
  const ratio = figure.ratio
    ? ` (${figure.ratio.kind === "odds_ratio" ? "odds" : "risk"} ratio ${figure.ratio.value.toFixed(2)}, 95% CI ${figure.ratio.low.toFixed(2)}–${figure.ratio.high.toFixed(2)})`
    : "";
  return `${figure.percent.toFixed(1)}% of ${outcomeLabel.toLowerCase()} cases in ${figure.place} may be attributed to heat in ${figure.when}${ratio}.`;
}
