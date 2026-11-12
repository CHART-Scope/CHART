import type { PlanTiming, RiskLevel } from "@/lib/savedPlansClient";

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
